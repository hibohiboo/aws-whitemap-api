#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import { AWSWhiteMapAPIStack } from '../lib/cdk-stack'

const app = new cdk.App()
const properties = {
  clientStack: {
    stackName: 'AWSWhiteMapClientStack',
    bucketName: 'aws-whitemap-cloudfront',
  },
  apiStack: {
    stackName: 'AWSWhiteMapAPIStack',
    restApiGatewayName: 'aws-whitemap-api',
  }
}
new AWSWhiteMapAPIStack(app, properties.apiStack.stackName, properties)
