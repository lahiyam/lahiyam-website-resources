import AWS from "../libs/aws-sdk";
import { v4 as uuidv4 } from "uuid";
const s3 = new AWS.S3();
const codePipeline = new AWS.CodePipeline();
const cloudFront = new AWS.CloudFront();
const admZip = require("adm-zip");
const mimeTypes = require("mime-types");

async function uploadFileToS3(
  key,
  data,
  additionalParams?
): Promise<AWS.S3.PutObjectOutput> {
  const params = {
    Body: data,
    Bucket: process.env.deploymentBucketName,
    Key: key,
    ACL: "public-read"
  };
  let mimeType = mimeTypes.lookup(key);
  if (typeof mimeType === "string") {
    Object.assign(params, { ContentType: mimeType });
  }
  if (additionalParams) {
    Object.assign(params, additionalParams);
  }
  return s3.putObject(params).promise();
}

async function clearCdnCache(
  paths
): Promise<AWS.CloudFront.CreateInvalidationResult> {
  const params = {
    DistributionId: process.env.cfDistributionId,
    InvalidationBatch: {
      CallerReference: uuidv4(Date.now()),
      Paths: paths
    }
  };
  return cloudFront.createInvalidation(params).promise();
}

async function extractArchiveToS3(params): Promise<AWS.S3.GetObjectOutput> {
  let s3PromiseResult = await s3.getObject(params).promise();
  let zip = new admZip(s3PromiseResult.Body);
  let zipFiles = zip.getEntries();
  for (const file of zipFiles) {
    let filePath = file.entryName;
    if (filePath.indexOf(REACT_BUILD_DIR) === 0) {
      let s3Key = filePath.replace(REACT_BUILD_DIR, "");
      let additionalParams = undefined;
      if (
        filePath.indexOf("service-worker.js") > -1 ||
        filePath.indexOf("index.html") > -1
      ) {
        additionalParams = {
          CacheControl: "max-age=0, no-cache, no-store, must-revalidate"
        };
      }
      await uploadFileToS3(s3Key, file.getData(), additionalParams);
    }
  }
  return s3PromiseResult;
}

const stage = process.env.stage ? process.env.stage : "dev";
const REACT_BUILD_DIR = `services/app/build/${stage}`;

export const handler = async (event, _context): Promise<void> => {
  console.log("EVENT\n\n", JSON.stringify(event, null, 2));

  function putJobSuccess(jobId): Promise<{}> {
    let params = { jobId };
    return codePipeline.putJobSuccessResult(params).promise();
  }
  function putJobFailure(jobId, message): Promise<{}> {
    let params = {
      failureDetails: {
        message: JSON.stringify(message),
        type: "JobFailed",
        externalExecutionId: _context.awsRequestId
      },
      jobId: jobId
    };
    return codePipeline.putJobFailureResult(params).promise();
  }

  let pipelineJob = event["CodePipeline.job"];
  try {
    let s3Bucket =
      pipelineJob.data.inputArtifacts[0].location.s3Location.bucketName;
    let objectKey =
      pipelineJob.data.inputArtifacts[0].location.s3Location.objectKey;
    let getParams = {
      Bucket: s3Bucket,
      Key: objectKey
    };
    await extractArchiveToS3(getParams);
    await clearCdnCache({
      Quantity: 2,
      Items: ["/index.html", "/service-worker.js"]
    });
    await putJobSuccess(pipelineJob.id);
    _context.succeed("Success");
  } catch (e) {
    console.error(e);
    await putJobFailure(pipelineJob.i1d, e);
    _context.fail(JSON.stringify(e));
  }
};
