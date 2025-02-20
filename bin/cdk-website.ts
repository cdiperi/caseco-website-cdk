#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WebsiteStack } from '../lib/cdk-website-stack';

const app = new cdk.App();

// Create beta environment
new WebsiteStack(app, 'CasecoWebsiteBetaStack', {
  environment: 'beta',
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});

// Create prod environment
new WebsiteStack(app, 'CasecoWebsiteProdStack', {
  environment: 'prod',
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});