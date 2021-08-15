import * as core from '@aws-cdk/core';
import * as apigateway from '@aws-cdk/aws-apigateway';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';

interface Props extends core.StackProps {
  clientStack: {
    stackName: string
    bucketName: string
  },
  apiStack: {
    restApiGatewayName: string
  }
}

export class AWSWhiteMapAPIStack extends core.Stack {
  constructor(scope: core.Construct, id: string, props: Props) {
    super(scope, id, props)
    // CloudFront オリジン用のS3バケットを参照
    const bucket = s3.Bucket.fromBucketName(this, props.clientStack.stackName, props.clientStack.bucketName);
    const restApiRole = this.createRestAPIRole(bucket);
    const restApi = this.createRestAPIGateway(props.apiStack.restApiGatewayName)

    const integration = this.createAwsIntegrationToUploadBackgroundImage(
      {
        toUploadBucketPath: `${bucket.bucketName}/data/background-images/{folder}/{object}`,
        restApiRole
      });
    const methodOptions = this.createMethodOptions();
    // リソースを作成する `/users/{userId}/files/{fileName}`
    const users = restApi.root.addResource('users');
    const userId = users.addResource('{userId}');
    const files = userId.addResource('files');
    const fileName = files.addResource('{fileName}');

    // オブジェクトをアップロードするための PUT メソッドを作成する
    fileName.addMethod('PUT', integration, methodOptions);

  }

  private createRestAPIRole(bucket: s3.IBucket) {
    const restApiRole = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      path: '/',
    });
    bucket.grantReadWrite(restApiRole);
    return restApiRole;
  }

  private createRestAPIGateway(restApiName: string) {
    const restApi = new apigateway.RestApi(this, restApiName, {
      restApiName,
      deployOptions: {
        stageName: 'v1',
        // loggingLevel: apigateway.MethodLoggingLevel.INFO,
        // dataTraceEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS', 'PUT', 'DELETE'],
        statusCode: 200,
      },
    });
    return restApi;
  }

  private createAwsIntegrationToUploadBackgroundImage(prop: {
    toUploadBucketPath: string
    restApiRole: iam.Role
  }) {
    const integration = new apigateway.AwsIntegration({
      service: 's3',
      integrationHttpMethod: 'PUT',
      // アップロード先を指定する
      path: prop.toUploadBucketPath,
      options: {
        credentialsRole: prop.restApiRole,
        passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
        requestParameters: {
          // メソッドリクエストのパスパラメータ userId を 統合リクエストのパスパラメータ folder にマッピングする
          'integration.request.path.folder': 'method.request.path.userId',
          // メソッドリクエストのパスパラメータ fileName を 統合リクエストの object にマッピングする
          'integration.request.path.object': 'method.request.path.fileName',
        },
        integrationResponses: [
          this.createOkResponse()
          , this.createNotFoundResponse()
          , this.createServerErrorResponse()
        ],
      },
    })
    return integration;
  }
  private createOkResponse(): apigateway.IntegrationResponse {
    return {
      statusCode: '200',
      responseParameters: {
        'method.response.header.Timestamp':
          'integration.response.header.Date',
        'method.response.header.Content-Length':
          'integration.response.header.Content-Length',
        'method.response.header.Content-Type':
          'integration.response.header.Content-Type',
        ...this.createServerErrorResponse().responseParameters,
      },
    }
  }
  private createNotFoundResponse(): apigateway.IntegrationResponse {
    return {
      statusCode: '400',
      selectionPattern: '4\\d{2}',
      responseParameters: this.createServerErrorResponse().responseParameters,
    }
  }
  private createServerErrorResponse(): apigateway.IntegrationResponse {
    return {
      statusCode: '500',
      selectionPattern: '5\\d{2}',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers':
          "'Content-Type,Authorization'",
        'method.response.header.Access-Control-Allow-Methods':
          "'OPTIONS,POST,PUT,GET,DELETE'",
        'method.response.header.Access-Control-Allow-Origin': "'*'",
      },
    }
  }

  private createMethodOptions(): apigateway.MethodOptions {
    const responseParameters = {
      'method.response.header.Access-Control-Allow-Headers': true,
      'method.response.header.Access-Control-Allow-Methods': true,
      'method.response.header.Access-Control-Allow-Origin': true,
    }
    return {
      requestParameters: {
        'method.request.path.userId': true,
        'method.request.path.fileName': true,
      },
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Timestamp': true,
            'method.response.header.Content-Length': true,
            'method.response.header.Content-Type': true,
            ...responseParameters
          },
        },
        {
          statusCode: '400',
          responseParameters,
        },
        {
          statusCode: '500',
          responseParameters,
        },
      ],

    }
  }
