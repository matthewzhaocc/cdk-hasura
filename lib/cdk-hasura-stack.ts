import * as cdk from '@aws-cdk/core';
import * as ecsPatterns from '@aws-cdk/aws-ecs-patterns';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as rds from '@aws-cdk/aws-rds';
import * as certManager from '@aws-cdk/aws-certificatemanager';
import * as route53 from '@aws-cdk/aws-route53';
import * as secretsManager from '@aws-cdk/aws-secretsmanager';
export class CdkHasuraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const dnsZone = route53.HostedZone.fromHostedZoneAttributes(this, 'dnsZone', {
      zoneName: 'demo.lhl.lol',
      hostedZoneId: 'Z1004606KSH6IIDAVC04'
    })
    const cert = new certManager.Certificate(this, 'democert', {
      validation: certManager.CertificateValidation.fromDns(dnsZone),
      domainName: 'demo.lhl.lol'
    })
    const vpc = new ec2.Vpc(this, 'hasuraVpc');
    const credSecret = new secretsManager.Secret(this, 'db-secret', {
      secretName: '/hasura',
      generateSecretString: {
        passwordLength: 20,
        excludePunctuation: true
      }
    })
    const db = new rds.DatabaseCluster(this, 'hasura-db', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_12_4 }) ,
      instanceProps: {
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.R5, ec2.InstanceSize.LARGE),
          vpc,
          vpcSubnets: {
            subnetType: ec2.SubnetType.PRIVATE
          },
      },
      credentials: rds.Credentials.fromPassword('matthew', credSecret.secretValue),
      defaultDatabaseName: 'hasura'
    })
    db.connections.allowDefaultPortFromAnyIpv4();
    const hasuraApp = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'hasuraApp', {
      vpc,
      taskImageOptions: {
        environment: {
          HASURA_GRAPHQL_ENABLE_CONSOLE: 'true',
          HASURA_GRAPHQL_DATABASE_URL: `postgres://matthew:${credSecret.secretValue.toString()}@${db.clusterEndpoint.hostname}:5432/hasura`  
        },
        containerPort: 8080,
        image: ecs.ContainerImage.fromRegistry('hasura/graphql-engine:latest'),
      },
      cpu: 256,
      memoryLimitMiB:1024,
      domainZone: dnsZone,
      domainName: "demo.lhl.lol",
      certificate: cert
    })
  }
}
