#! /bin/bash
npm install -g serverless
cd $CODEBUILD_SRC_DIR/services/$service || exit
ls
serverless deploy --stage $env --package \
$CODEBUILD_SRC_DIR/services/$service/target/$env -v -r $AWS_REGION
