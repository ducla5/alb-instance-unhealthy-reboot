const { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTargetGroupsCommand, DescribeTargetHealthCommand } = require("@aws-sdk/client-elastic-load-balancing-v2");
const { EC2Client, RebootInstancesCommand } = require("@aws-sdk/client-ec2");
const { IncomingWebhook } = require("@slack/webhook");

exports.handler = async function (event, context) {
  try {
    const message = JSON.parse(event.Records[0].Sns.Message);
    const elb = (message.Trigger && message.Trigger.Dimensions) ? message.Trigger.Dimensions[1] : null;

    if (!elb) {
      console.log('No elb value found in message', message);
      return 'No ELB value found';
    }

    const alb_name = elb.value.split("/")[1];
    const elbClient = new ElasticLoadBalancingV2Client({});
    const ec2Client = new EC2Client({});
    const url = process.env.SLACK_WEBHOOK_URL;
    const webhook = new IncomingWebhook(url);

    const loadBalancersData = await elbClient.send(new DescribeLoadBalancersCommand({ Names: [alb_name] }));

    const targetGroupsData = await elbClient.send(new DescribeTargetGroupsCommand({
      LoadBalancerArn: loadBalancersData.LoadBalancers[0].LoadBalancerArn
    }));

    const targetHealthData = await elbClient.send(new DescribeTargetHealthCommand({
      TargetGroupArn: targetGroupsData.TargetGroups[0].TargetGroupArn
    }));

    const unhealthyNodes = targetHealthData.TargetHealthDescriptions
      .filter(instance => instance.TargetHealth.State === 'unhealthy')
      .map(instance => instance.Target.Id);

    if (unhealthyNodes.length) {
      console.log('Rebooting unhealthy nodes', unhealthyNodes);
      await webinar.send({
        text: "Rebooting unhealthy nodes: " + unhealthyNodes.join(", "),
      });
      await ec2Client.send(new RebootInstancesCommand({ InstanceIds: unhealthyNodes }));
    } else {
      console.log('All nodes in service, no reboots necessary');
    }

    console.log('Process complete');
    return 'Success';
  } catch (err) {
    console.error('Error processing', err);
    return 'Fail';
  }
};