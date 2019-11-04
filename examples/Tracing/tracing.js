const { initTracer: initJaegerTracer } = require("jaeger-client");
const opentracing = require('opentracing');
const container = require('rhea');

const _trace_key = ('x-opt-qpid-tracestate');

let initTracer = (serviceName) => {
  const config = {
    serviceName: serviceName,
    sampler: {
      type: "const",
      // priority: 1,
      param: 1,
      format: "proto",
    },
    reporter: {
      logSpans: true,
    },
  };
  const options = {
    logger: {
      info(msg) {
        console.log("INFO ", msg);
      },
      error(msg) {
        console.log("ERROR", msg);
      },
    },
  };
  return initJaegerTracer(config, options);
};

module.exports.testTracer = function test(serviceName){
  opentracing.initGlobalTracer(initTracer(serviceName));
  this.tracer = opentracing.globalTracer();
  global = opentracing.globalTracer(); 

  container.on('sendable', (e) => {
    connection = e.sender.connection;
    span_tags = {
      aaaa: opentracing.Tags.SPAN_KIND_MESSAGING_CONSUMER,
      // bbbb: receiver.source.address,
      cccc: connection.connected_address,
      dddd: connection.hostname,
      'inserted_by': 'proton-message-tracing'
    }
    span = this.tracer.startSpan('amqp-delivery-send', tags=span_tags)

    headers = {};

    this.tracer.inject(span, opentracing.FORMAT_TEXT_MAP, headers);

    span.setTag('delivery-tag')

    span.finish();
  });


  container.on('message', (e) => {
    let message = e.message;
    let receiver = e.receiver;
    let connection = e.connection;
    span_tags = {
      aaaa: opentracing.Tags.SPAN_KIND_MESSAGING_CONSUMER,
      bbbb: receiver.source.address,
      cccc: connection.connected_address,
      dddd: connection.hostname,
      'inserted_by': 'proton-message-tracing'
    }

    if(message.message_annotations == undefined){
      ctx = this.tracer.startSpan('amqp-deliver-receive-2', tags = span_tags);
      ctx.finish();
    } else {
      headers = message.message_annotations[_trace_key];

      let abc = new Buffer(headers['uber-trace-id']);
      let cba = { 'uber-trace-id': abc.toString()};

      span_ctx = this.tracer.extract(opentracing.FORMAT_TEXT_MAP, cba);

      let wtf = this.tracer.startSpan('amqp-delivery-receive-1', { childOf: span_ctx}, tags = span_tags);
      wtf.finish();
    }
  })
}



module.exports.client = function(url, requests, tracer){

  this.url = url;
  this.requests_queued = [];
  this.requests_outstanding = [];
  this.receiver;
  this.sender =1;

  let add_request = (e) => {
    tags = { 'request': e};
    span = opentracing.globalTracer().startSpan('request');
    span.setTag("request", e);
    id = container.generate_uuid();
    this.requests_queued.push( [id, e, span] );
  };

  requests.forEach(e => {
      add_request(e);
  });

  let pop_request = (id) => {
    this.requests_outstanding.forEach(e => {
      console.log(`\ne:${e[0]}\nid:${id}\n`);
      if(e[0]==id){
        let temp = e;
      }
    });
    console.log("test")
    let test123 = this.requests_outstanding.splice(0,1);
    return test123;
  }

  container.on('connection_open',(e) => {
    this.sender = e.connection.open_sender(this.url);
    this.receiver = e.connection.open_receiver(this.sender.connection, null, dynamic=true);
    if(e.receiver == this.receiver){
      while(this.requests_queued.length > 0){
        next_request();
      }
    }
  });

  let next_request = () => {
    if(this.receiver.source != undefined ){
      [id, req, span] = this.requests_queued.pop();

      // opentracing.globalTracer().scopeManager.activate(span, False);
      span.log({'event': 'request-sent'});
      msg = container.message = (replyTo=this.receiver.source.address, correlation_id=id, body=req);
      this.sender.send(msg);
      this.requests_outstanding.push([id, req, span]);
    }
  }

  container.on('receiver_open' ,(e) => {
    if(e.receiver == this.receiver){
      while(this.requests_queued.length > 0){
        next_request();
      }
    }
  });

  container.on('message', (e) => {
    // id=e.receiver.name;
    id=e.message.to;
    reply = e.message.body;
    popVal = pop_request(id);

    if(popVal[0] != undefined){
      req = popVal[0][0];
      tester = popVal[0][1];
      span = popVal[0][2];
    } 

    span.log({'event': 'reply-received', 'result': reply});
    span.finish();
    console.log(`${req} => ${reply}`);
    if(this.requests_queued.length > 0){
       next_request();
    } else if(this.requests_outstanding.length == 0) {
      e.connection.close();
    }
  })
};