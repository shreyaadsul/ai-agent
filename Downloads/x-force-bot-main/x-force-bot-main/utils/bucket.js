import axios from "axios";
import { createReadStream, existsSync } from "fs";
import { Storage } from "@google-cloud/storage";

import { axiosConfig } from "./utils.js";

const keyFilename = "./google-bucket.json";
const storageConfig = {};

if (existsSync(keyFilename)) {
  storageConfig.keyFilename = keyFilename;
} else {
  console.warn(`[WARNING] Google Cloud Storage key file not found at ${keyFilename}. Ensure GOOGLE_APPLICATION_CREDENTIALS is set or the file exists.`);
}

const storage = new Storage(storageConfig);
const bucketName = "attendance-bucket-autowhat";
const bucket = storage.bucket(bucketName);

export async function uploadToBucket(url, fileName) {
  const downloadImageConfig = await axiosConfig(url, "get");
  const response = await axios({
    ...downloadImageConfig,
    responseType: "stream",
  });

  const blob = bucket.file(fileName);
  const blobStream = blob.createWriteStream({
    resumable: false,
  });

  return new Promise((resolve, reject) => {
    response.data.pipe(blobStream);

    blobStream.on("error", (error) => {
      reject({
        status: "failed",
        message: "Failed to upload",
        error: error.message,
      });
    });

    blobStream.on("finish", async () => {
      try {
        const [url] = await blob.getSignedUrl({
          action: "read",
          expires: "01-01-2030",
        });
        resolve({
          status: "success",
          message: "Uploaded the file successfully",
          url,
        });
      } catch (error) {
        reject({
          status: "failed",
          message: `Uploaded the file successfully: ${fileName}, but public access is denied!`,
          error: error.message,
        });
      }
    });
  });
}

export async function uploadFileToBucket(filePath, fileName) {
  try {
    const stream = createReadStream(filePath);

    const blob = bucket.file(fileName);
    const blobStream = blob.createWriteStream({
      resumable: false,
    });

    return new Promise((resolve, reject) => {
      stream.pipe(blobStream);

      blobStream.on("error", (error) => {
        reject({
          status: "failed",
          message: "Failed to upload",
          error: error.message,
        });
      });

      blobStream.on("finish", async () => {
        try {
          const [url] = await blob.getSignedUrl({
            action: "read",
            expires: "01-01-2030",
          });
          resolve({
            status: "success",
            message: "Uploaded the file successfully",
            url,
          });
        } catch (error) {
          reject({
            status: "failed",
            message: `Uploaded the file successfully: ${fileName}, but public access is denied!`,
            error: error.message,
          });
        }
      });
    });
  } catch (err) {
    console.error(err);
  }
}

/**
 * Uploads a base64 encoded image to Google Cloud Storage bucket.
 * @param {string} base64String - The base64 encoded image string.
 * @param {string} fileName - The name of the file to be saved in the bucket.
 * @returns {Promise<Object>} - Promise that resolves with the upload status and URL.
 */
export async function uploadBase64ToBucket(base64String, fileName) {
  // Convert base64 to a buffer
  const buffer = Buffer.from(base64String, "base64");

  // Create a file in the bucket
  const blob = bucket.file(fileName);
  const blobStream = blob.createWriteStream({
    resumable: false,
  });

  return new Promise((resolve, reject) => {
    blobStream.end(buffer);

    blobStream.on("error", (error) => {
      reject({
        status: "failed",
        message: "Failed to upload base64 image",
        error: error.message,
      });
    });

    blobStream.on("finish", async () => {
      try {
        // Generate a signed URL for the uploaded file
        const [url] = await blob.getSignedUrl({
          action: "read",
          expires: "01-01-2030",
        });
        resolve({
          status: "success",
          message: "Uploaded the base64 image successfully",
          url,
        });
      } catch (error) {
        reject({
          status: "failed",
          message: `Uploaded the base64 image successfully: ${fileName}, but public access is denied!`,
          error: error.message,
        });
      }
    });
  });
}