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
        this.debug_mode = false;
    }

    add_message_handlers_from_object(handlers) {
        for(let [cmd_filter, handler] of Object.entries(handlers)) {
            this.add_message_handler(cmd_filter, handler);
        }
    }

    add_message_handler(cmd_filter, handler) {
        this.message_dispatch[cmd_filter] = handler.bind(this);
    }

    start() {
        console.log("client ready");
        this.client_ready = true;
        if(this.socket_ready) {
            this.send_introduction_message();
        }
    }

    onopen(event) {
        console.log("socket opened");
        this.socket_ready = true;
        if(this.client_ready){
            this.send_introduction_message();
        }
    }

    send_introduction_message(){
        console.log("send_introduction_message");
        this.send("new_user", {});
    }

    onmessage(event) {
        let msg = JSON.parse(event.data);
        this.handle_message_dispatch(msg);
    }


    display_click_handler(cls, x, y) { 
        this.send("click", { "chart_class" : cls, "x" : x, "y" : y });
    }
    

    send(cmd, kwargs) { // args parameter?
        let args = []
        console.log("send message", cmd, kwargs);
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

    console_log_if_debug(msg) {
        if(this.debug_mode) {
            console.log(msg);
        }
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
        this.console_log_if_debug(msg);
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
                if(this.message_dispatch[partial_cmd] !== undefined){
                    key = partial_cmd; 
                    break;
                }
            }
            this.console_log_if_debug("cmd", msg.cmd, "key", key);
            this.console_log_if_debug("received message","cmd", msg.cmd, "key", key);
            if(key === undefined) {
                throw new UnknownCommandError(`Console sent unknown command "${msg.cmd[0]}".`);
            }
            this.message_dispatch[key](msg.cmd, msg.args, msg.kwargs);
        } catch(err) {
            succeeded = false;
            error = err;
        }
    
        if(!succeeded) {
            this.console_log_if_debug(error);
            this.log_exception(error, msg);
        }
    }    
}


let default_message_handlers = {
    "initialize.chart.state" : function(cmd, args, kwargs) {
        this.console_log_if_debug("accepted user:", kwargs.state);
        this.sseq = SpectralSequenceChart.from_JSON(kwargs.state);
        this.display = this.make_display(this.sseq);
        this.display.y_clip_offset = this.sseq.y_clip_offset;
        this.set_display_state(kwargs.display_state)
        this.display.on("click", this.display_click_handler.bind(this));
        this.send("initialize.complete", {});
        // if(kwargs.display_state) {
        //     set_display_settings(kwargs.display_state);
        // }
        // let sseq = new SpectralSequenceChart();
        // Object.assign(sseq, msg.state)
    },

    "chart.batched" : function(cmd, args, kwargs) {
        for(msg of kwargs.messages) {
            this.handle_message_dispatch(msg);
        }
        this.display.update()
    },
    
    "chart.state.reset" : function(cmd, args, kwargs) {
        this.console_log_if_debug("accepted user:", kwargs.state);
        this.sseq = SpectralSequenceChart.from_JSON(kwargs.state);
        if(kwargs.display_state !== undefined){
            this.set_display_state(kwargs.display_state);
        }
        this.display.y_clip_offset = this.sseq.y_clip_offset;
        this.display.setSseq(this.sseq);
        // this.display.on("click", this.display_click_handler.bind(this));
        // this.send("initialize.complete", {});
        // if(kwargs.display_state) {
        //     set_display_settings(kwargs.display_state);
        // }
        // let sseq = new SpectralSequenceChart();
        // Object.assign(sseq, msg.state)
    },

    "chart.set_x_range" : function(cmd, args, kwargs){
        this.sseq.x_range = [kwargs.x_min, kwargs.x_max];
    },
    "chart.set_y_range" : function(cmd, args, kwargs){
        this.sseq.y_range = [kwargs.y_min, kwargs.y_max];
    },
    "chart.set_initial_x_range" : function(cmd, args, kwargs){
        this.sseq.initial_x_range = [kwargs.x_min, kwargs.x_max];
    },
    "chart.set_initial_y_range" : function(cmd, args, kwargs){
        this.sseq.initial_y_range = [kwargs.y_min, kwargs.y_max];
    },    
    "chart.insert_page_range" : function(cmd, args, kwargs) {
        this.sseq.page_list.splice(kwargs.idx, 0, kwargs.page_range);
    },

    "chart.node.add" : function(cmd, args, kwargs) {
        this.console_log_if_debug("add node", cmd, kwargs)
        // this.info(msg);
    },

    "chart.class.add" : function(cmd, args, kwargs) {
        let c = this.sseq.add_class(kwargs.new_class);
        this.display.update();
    },

    "chart.class.update" : function(cmd, args, kwargs) {
        let c = kwargs.class_to_update;
        Object.assign(this.sseq.classes[c.uuid], c);
        // this.display.update();
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
        this.console_log_if_debug(kwargs);
        this.sseq.add_edge(kwargs);
        // this.display.update();
    },

    "chart.edge.update" : function(cmd, args, kwargs) {
        this.console_log_if_debug(kwargs);
        let e = kwargs.edge_to_update;
        Object.assign(this.sseq.edges[e.uuid], e);
        // this.display.update();
    },

    "display.set_background_color" : function(cmd, args, kwargs) {
        this.display.setBackgroundColor(kwargs.color);
    },

    "interact.alert" : function(cmd, args, kwargs) {
        alert(kwargs.msg);
    },
    "interact.prompt" : function(cmd, args, kwargs) {
        let result = prompt(kwargs.msg, kwargs.default);
        this.send("interact.result", {"result" : result});
    }
};

exports.SpectralSequenceSocketListener = SpectralSequenceSocketListener;