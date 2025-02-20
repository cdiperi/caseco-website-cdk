import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';

export class WebsiteStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing Route53 hosted zone
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: 'Z00755652O7ROSUDROQNF',
      zoneName: 'diperidata.com'
    });

    // Import existing certificate
    const certificate = Certificate.fromCertificateArn(this, 'Certificate',
      'arn:aws:acm:us-east-1:094671918355:certificate/506b6816-092e-4305-a1cb-2aefd561da59');

    // Create S3 bucket for website content (as CloudFront origin)
    const bucket = new s3.Bucket(this, 'WebsiteBucket', {
      websiteIndexDocument: 'index.html',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    // Create CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      domainNames: ['diperidata.com', 'www.diperidata.com'],
      certificate: certificate,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    // Create Route53 records
    new route53.ARecord(this, 'ARecord', {
      zone,
      recordName: 'diperidata.com',
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
    });

    new route53.ARecord(this, 'WwwARecord', {
      zone,
      recordName: 'www.diperidata.com',
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
    });

    // Set up Amplify app without direct GitHub connection yet
    const amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
      name: 'caseco-website',
      iamServiceRole: new iam.Role(this, 'AmplifyServiceRole', {
        assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify')
        ]
      }).roleArn,
      buildSpec: `
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: build
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
`
    });

    // Create placeholder branch - you'll connect the actual repo later
    const mainBranch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
      enableAutoBuild: true,
      framework: 'React',
      stage: 'PRODUCTION'
    });

    // Create Amplify Domain Association
    new amplify.CfnDomain(this, 'AmplifyDomain', {
      appId: amplifyApp.attrAppId,
      domainName: 'diperidata.com',
      subDomainSettings: [
        {
          branchName: mainBranch.branchName,
          prefix: ''
        },
        {
          branchName: mainBranch.branchName,
          prefix: 'www'
        }
      ],
      enableAutoSubDomain: true,
    });

    // Deploy content to S3 for CloudFront (as fallback or for static assets)
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('./website-content')],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });
  }
}