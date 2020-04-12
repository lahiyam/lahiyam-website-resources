#! /bin/bash
npm install -g serverless
npm install --silent --no-progress
cd $CODEBUILD_SRC_DIR/services/$service || exit
npm install --silent --no-progress
serverless deploy --stage $env --package \
$CODEBUILD_SRC_DIR/services/$service/target/$env -v -r $AWS_REGION
