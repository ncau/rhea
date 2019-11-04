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



