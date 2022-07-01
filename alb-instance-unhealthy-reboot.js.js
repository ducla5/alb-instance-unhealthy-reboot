const AWS = require('aws-sdk');
const waterfall = require('async-waterfall');
const ChatworkApi = require('chatwork-api-client').default

exports.handler = function (event, context, callback) {

  const message = JSON.parse(event.Records[0].Sns.Message);
  const elb = (message.Trigger && message.Trigger.Dimensions) ? message.Trigger.Dimensions[1] : null;

  const alb_name = elb.value.split("/")[1]

  if (!elb) return console.log('No elb value found in message', message);

  const elbApi = new AWS.ELBv2();
  const ec2Api = new AWS.EC2();
  const api = new ChatworkApi(process.env.CHATWORK_TOKEN);
  waterfall([
    function (next) {
      const params = {
        Names: [alb_name]
      };
      elbApi.describeLoadBalancers(params, next);
    },
    function (data, next) {
      const params = {
        LoadBalancerArn: data.LoadBalancers[0].LoadBalancerArn,
      };
      elbApi.describeTargetGroups(params, next);
    },
    function (data, next) {
      const params = {
        TargetGroupArn: data.TargetGroups[0].TargetGroupArn,
      };
      elbApi.describeTargetHealth(params, next);
    },
    function (data, next) {
      const unhealthyNodes = data.TargetHealthDescriptions
        .filter(instance => instance.TargetHealth.State === 'unhealthy')
        .map(instance => instance.Target.Id);
      if (unhealthyNodes.length) {
        console.log('Rebooting unhealthy nodes', unhealthyNodes);
        const chatworkParams = {
          body: "Rebooting unhealthy nodes: " + unhealthyNodes.join(", ")
        }
        api.postRoomMessage(process.env.ROOM_ID, chatworkParams)
        ec2Api.rebootInstances({ InstanceIds: unhealthyNodes }, next);
      } else {
        next(null, 'All nodes InService, no reboots necessary');
      }
    },
  ], function (err, result) {
    console.log('Process complete', result);
    callback(err, (err) ? 'Fail' : 'Success');
  });
};