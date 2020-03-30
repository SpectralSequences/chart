class BadMessageError extends TypeError {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name;
        this.stack = this.stack.split("\n").slice(1).join("\n")
    }
}

class UnknownCommandError extends BadMessageError {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name;
        this.stack = this.stack.split("\n").slice(1).join("\n")
    }
}

class InvalidCommandError extends BadMessageError {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name;
        this.stack = this.stack.split("\n").slice(1).join("\n")
    }
}


class UnknownDisplayCommandError extends UnknownCommandError {
    constructor(...args) {
        super(...args)
        this.name = this.constructor.name;
        this.stack = this.stack.split("\n").slice(1).join("\n")
    }
}

// let ws = new WebSocket("ws://localhost:{{ PORT }}/ws/sseq/{{ channel_name }}");


class SpectralSequenceSocketListener {
    constructor(websocket, make_display) {
        this.websocket = websocket;
        this.websocket.onmessage = this.onmessage.bind(this);
        this.websocket.onopen = this.onopen.bind(this);
        this.make_display = make_display;
        this.display = undefined;
        this.sseq = undefined;
        this.message_dispatch = {};
        this.add_message_handlers_from_object(default_message_handlers);
    }

    add_message_handlers_from_object(handlers) {
        for([cmd_filter, handler] in Object.entries(handlers)) {
            this.add_message_handler(cmd_filter, handler);
        }
    }

    add_message_handler(cmd_filter, handler) {
        this.message_dispatch[cmd_filter] = handler.bind(this);
    }

    onopen(event) {
        this.send("new_user", {});
    }

    onmessage(event) {
        let msg = JSON.parse(event.data);
        handle_message_dispatch(msg);
    }


    display_click_handler(cls) {
        if(cls != null){
            this.send("click", { "chart_class" : cls });
        }
    }
    

    send(cmd, kwargs) { // args parameter?
        let args = []
        console.log(cmd, kwargs);
        // if(args === undefined || kwargs === undefined) {
        //     throw TypeError(`Send with missing arguments.`);
        // }
        // if(args.constructor !== Array){
        //     throw TypeError(`Argument "args" expected to have type "Array" not "${args.constructor.name}"`);
        // }
        if(kwargs.constructor !== Object){
            throw TypeError(`Argument "kwargs" expected to have type "Array" not "${kwargs.constructor.name}"`);
        }            
        if("cmd" in kwargs) {
            throw ValueError(`Tried to send message with top level "cmd" key`);
        }
        let obj = { "cmd" : cmd, "args" : args, "kwargs" : kwargs };
        let json_str = JSON.stringify(obj);
        this.websocket.send(json_str);
    }
    
    debug(type, text, orig_msg) {
        let cmd = "debug";
        if(type !== ""){
            cmd += `.${type}`
        }            
        this.send("debug", {
            "type" : type,
            "text" : text, 
            "orig_msg" : orig_msg
        });
    }

    info(type, text, orig_msg) {
        let cmd = "info";
        if(type !== ""){
            cmd += `.${type}`
        }
        this.send(cmd, {
            "type" : type,
            "text" : text, 
            "orig_msg" : orig_msg
        });
    }

    warning(type, text, orig_msg, stack_trace) {
        let cmd = "warning";
        if(type !== ""){
            cmd += `.${type}`
        }
        this.send(cmd, {
            "type" : type,
            "text" : text, 
            "orig_msg" : orig_msg,
            "stack_trace" : stack_trace
        });
    }

    error(type, msg) {
        let cmd = "error.client";
        if(type !== ""){
            cmd += `.${type}`
        }
        this.send(cmd, msg);
    }

    log_exception(error, orig_msg) {
        // For some reason JSON.stringify(error) drops the "message" field by default.
        // We move it to "msg" to avoid that.
        error.msg = error.message; 
        this.error(error.name, 
            {
                "exception" : error,
                "orig_msg" : orig_msg,
            }
        );
        console.error(error);
    }


    set_display_state(kwargs) {
        if("background_color" in kwargs){
            this.display.setBackgroundColor(kwargs.background_color);
        }
    }

    handle_message_dispatch(msg) {
        console.log(msg);
        let succeeded = true;
        let error;
        try {
            if(msg.cmd === undefined) {
                throw new UnknownCommandError(`Console sent message missing "cmd" field.`);
            }
    
            if(msg.cmd.constructor != Array){
                throw new InvalidCommandError(
                    `"msg.cmd" should have type "Array" not "${msg.cmd.constructor.name}."`
                );
            }
    
            if(msg.args === undefined) {
                throw new InvalidCommandError(
                    `Message is missing the "args" field.`
                );
            }
            
            if(msg.kwargs === undefined) {
                throw new InvalidCommandError(
                    `Message is missing the "kwargs" field.`
                );
            }
    
            let key = undefined;
            for(let partial_cmd of msg.cmd) {
                if(this.dispatch[partial_cmd] !== undefined){
                    key = partial_cmd; 
                    break;
                }
            }
            console.log("cmd", msg.cmd, "key", key);
            if(key === undefined) {
                throw new UnknownCommandError(`Console sent unknown command "${msg.cmd[0]}".`);
            }
            this.dispatch[key](msg.cmd, msg.args, msg.kwargs);
        } catch(err) {
            succeeded = false;
            error = err;
        }
    
        if(!succeeded) {
            console.log(error);
            this.log_exception(error, msg);
        }
    }
    
}


let default_message_handlers = {
    "chart.state" : function(cmd, args, kwargs) {
        // console.log("accepted user:", msg);
        console.log(kwargs.state);
        this.sseq = SpectralSequenceChart.from_JSON(kwargs.state);
        this.sseq._classes_by_uuid = {}
        for(let c of this.sseq.classes){
            this.sseq._classes_by_uuid[c.uuid] = c;
        }
        this.display = this.make_display(sseq);
        this.set_display_state(kwargs.display_state)
        display.on("click", this.click_handler.bind(this));
        // if(kwargs.display_state) {
        //     set_display_settings(kwargs.display_state);
        // }
        // let sseq = new SpectralSequenceChart();
        // Object.assign(sseq, msg.state)
    },
    
    "chart.insert_page_range" : function(cmd, args, kwargs) {
        this.sseq.page_list.splice(kwargs.idx, 0, kwargs.page_range);
    },

    "chart.node.add" : function(cmd, args, kwargs) {
        this.info(msg);
    },

    "chart.class.add" : function(cmd, args, kwargs) {
        this.sseq.add_class(kwargs.new_class);
        this.sseq._classes_by_uuid[kwargs.new_class.uuid] = kwargs.new_class;
        this.display.update();
    },

    "chart.class.update" : function(cmd, args, kwargs) {
        for(let c of kwargs.to_update) {
            Object.assign(this.sseq._classes_by_uuid[c.uuid], c);
        }
        this.display.update();
    },

    "chart.class.set_name" : function(cmd, args, kwargs) {
        let [x,y,idx] = load_args({
            "x" : Number.isInteger, 
            "y" : Number.isInteger, 
            "idx" : Number.isInteger
        });
        this.sseq.classes_by_degree.get([kwargs.x, msg.arguments.y])[msg.arguments.idx].name = msg.arguments.name;
    },

    "chart.edge.add" : function(cmd, args, kwargs) {
        console.log(kwargs);
        this.sseq.add_edge(kwargs);
        this.display.update();
    },

    "display.set_background_color" : function(cmd, args, kwargs) {
        this.display.setBackgroundColor(kwargs.color);
    },

    "alert" : function(cmd, args, kwargs) {
        alert(kwargs.alert_text);
    }
};

exports.SpectralSequenceSocketListener = SpectralSequenceSocketListener;