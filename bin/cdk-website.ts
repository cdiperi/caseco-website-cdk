#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WebsiteStack } from '../lib/cdk-website-stack';

const app = new cdk.App();
new WebsiteStack(app, 'CasecoWebsiteStack', {
  env: {
    account: '094671918355',
    region: 'us-east-1'
  }
});