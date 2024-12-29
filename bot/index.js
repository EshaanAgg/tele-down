const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');
const unzipper = require('unzipper');
const FormData = require('form-data');
const unrar = require('node-unrar-js');

// CONSTANTS
const UNZIP_DIR = './unzipped/';
const BASE_SERVER_URL = 'http://localhost:8081';
const LEFT_OVER_POLLS = {
   archive_polls: [],
};
const SUPPORTED_PHOTO_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff'];
const SUPPORTED_VIDEO_TYPES = ['mp4', 'avi', 'mov', 'mkv', 'webm', '.ts'];

// GLOBALS
let client = undefined;

// HELPERS
/*
 * Setup the bot with the Telegram API and initialize the client
 * @throws {Error} If the BOT_TOKEN is not found in the environment variables
 */
const setupBot = async () => {
   dotenv.config({ path: path.resolve(__dirname, '../.env') });

   const BOT_TOKEN = process.env.BOT_TOKEN;
   if (!BOT_TOKEN) {
      console.error('BOT_TOKEN is required in the environment variables.');
      process.exit(1);
   }
   client = axios.create({ baseURL: `${BASE_SERVER_URL}/bot${BOT_TOKEN}` });

   if (!fs.existsSync(UNZIP_DIR)) fs.mkdirSync(UNZIP_DIR);

   // Make a request to /getMe to check if the bot is running
   try {
      const getMeResponse = await client.get('/getMe');
      const botName = getMeResponse.data.result.username;
      console.log(`Bot "${botName}" is running...`);
   } catch (error) {
      console.error('Error starting the bot:', error.message);
      process.exit(1);
   }
};

const sendDownloadPathMessage = async (chatId, filePath) => {
   const fileName = path.basename(filePath);
   const relativePath = path.relative(`${__dirname}/..`, filePath);

   const message =
      '✅Downloaded `' +
      fileName +
      '` successfully on the server!\n\n\n- File Name: `' +
      fileName +
      '`\n- Path: `' +
      relativePath +
      '`';
   await sendMessage(chatId, message);
};

/*
 * Send a message to a chat
 * @param {number} chatId - The chat ID to send the message to
 * @param {string} text - The message text
 * @returns {Promise<number>} The message ID of the sent message
 */
const sendMessage = async (chatId, text) => {
   const response = await client.post('/sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
   });
   return response.data.result.message_id;
};

/*
 * Send a poll to a chat
 * @param {number} chatId - The chat ID to send the poll to
 * @param {string} question - The poll question
 * @param {string[]} options - The poll options
 * @returns {Promise<string>} The poll ID of the sent poll
 */
const sendPoll = async (chatId, question, options) => {
   const response = await client.post('/sendPoll', {
      chat_id: chatId,
      question,
      options: JSON.stringify(options),
   });
   return response.data.result.poll.id;
};

/*
 * Send a photo to a chat
 * @param {number} chatId - The chat ID to send the photo to
 * @param {string} photoPath - The path to the photo to send
 * @returns {Promise<number>} The message ID of the sent photo
 * @throws {Error} If the photo could not be sent
 */
const sendPhoto = async (chatId, photoPath) => {
   let photoData = fs.readFileSync(photoPath);
   let formData = new FormData();
   formData.append('chat_id', chatId);
   formData.append('photo', photoData, {
      filename: path.basename(photoPath),
   });

   const response = await client.post('/sendPhoto', formData, {
      headers: formData.getHeaders(),
   });
   return response.data.result.message_id;
};

/*
 * Send a video to a chat
 * @param {number} chatId - The chat ID to send the video to
 * @param {string} videoPath - The path to the video to send
 * @returns {Promise<number>} The message ID of the sent video
 * @throws {Error} If the video could not be sent
 */
const sendVideo = async (chatId, videoPath) => {
   let videoData = fs.readFileSync(videoPath);
   let formData = new FormData();
   formData.append('chat_id', chatId);
   formData.append('video', videoData, {
      filename: path.basename(videoPath),
   });

   const response = await client.post('/sendVideo', formData, {
      headers: formData.getHeaders(),
   });
   return response.data.result.message_id;
};

/*
 * Send a document to a chat
 * @param {number} chatId - The chat ID to send the document to
 * @param {string} filePath - The path to the file to send
 * @returns {Promise<number>} The message ID of the sent document
 */
const sendFile = async (chatId, filePath) => {
   // Check the file type
   const fileType = path.extname(filePath).slice(1);

   if (SUPPORTED_PHOTO_TYPES.includes(fileType))
      return await sendPhoto(chatId, filePath);
   else if (SUPPORTED_VIDEO_TYPES.includes(fileType))
      return await sendVideo(chatId, filePath);
   else {
      const messageID = await sendMessage(
         chatId,
         `I don't support sending files of type "${fileType}" [File: "${path.basename(filePath)}"].`,
      );
      return messageID;
   }
};
/*
 * Download a file from Telegram, given the file ID. Note that this method can be quite
 * RAM intensive for large files (>= 1GB) and may cause the other parallely running processes
 * to lag.
 * @param {string} fileId - The file ID to download
 * @returns {Promise<File>} - A promise that resolves with the file of the downloaded file
 * @throws {Error} If the file could not be downloaded
 */
const downloadFile = async (fileId) => {
   const response = await client.get(`/getFile?file_id=${fileId}`);
   return response.data.result;
};

/*
 * Extract a ZIP or RAR file to a directory
 * @param {string} archiveFilePath - The path to the archive file (zip or rar)
 * @param {string} outputDir - The directory to extract the file to
 * @returns {Promise<void>} - A promise that resolves when the file is extracted successfully
 */
/*
 * Extract a ZIP or RAR file to a directory
 * @param {string} archiveFilePath - The path to the archive file (zip or rar)
 * @param {string} outputDir - The directory to extract the file to
 * @returns {Promise<void>} - A promise that resolves when the file is extracted successfully
 */
const extractArchive = async (archiveFilePath, outputDir) => {
   const fileExtension = path.extname(archiveFilePath).toLowerCase();

   if (fileExtension === '.zip') {
      // Handle ZIP files
      return fs
         .createReadStream(archiveFilePath)
         .pipe(unzipper.Extract({ path: outputDir }))
         .promise();
   } else if (fileExtension === '.rar') {
      // Handle RAR files using createExtractorFromFile
      const extractor = await unrar.createExtractorFromFile({
         filepath: archiveFilePath,
         targetPath: outputDir,
      });

      const extractorResult = extractor.extract();

      //    Iterate over the extracted files as the extractor is a generator
      for (const _ of extractorResult.files) {
      }
   } else {
      throw new Error(
         'Unsupported file format. Only .zip and .rar are supported.',
      );
   }
};

/*
 * Recursively send files in a directory to a chat
 * @param {string} dir - The directory to send the files from
 * @param {number} chatId - The chat ID to send the files to
 * @param {string} fileName - The name of the file to send
 * @param {number} ident - The number of spaces to indent the message
 * @returns {Promise<void>} - A promise that resolves when all the files are sent
 */
const recursiveSendFiles = async (dir, chatId, fileName, ident = 0) => {
   console.log(`[SEND FILES] ${' '.repeat(ident)} ${dir}`);
   const files = fs.readdirSync(dir);
   for (const file of files) {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory())
         await recursiveSendFiles(filePath, chatId, fileName, ident + 2);
      else await sendFile(chatId, filePath);
   }
};

// Handlers
/*
 * Processes the messages recieved from the Telegram API
 */
const handleMessage = async (chatId, message) => {
   if (message === '/start')
      await sendMessage(chatId, 'Welcome to the bot! The bot is functional.');
   else await sendMessage(chatId, "I don't understand that command.");
};

/*
 * Processes archive documents recieved from the Telegram API
 * Currently it downloads them locally, and then sends a poll to the user to ask them
 * if want to be sent back the unzipped contents
 */
const handleArchive = async (chatId, document) => {
   await sendMessage(
      chatId,
      `Downloading the archive "${document.file_name}".`,
   );

   console.log(`[DOWNLOAD] Start "${document.file_name}"`);
   const file = await downloadFile(document.file_id);
   console.log(`[DOWNLOAD] Completed "${document.file_name}"`);
   await sendDownloadPathMessage(chatId, file.file_path);

   const pollId = await sendPoll(
      chatId,
      'Would you like me to send the unzipped the files back to you?',
      ['Yes', 'No'],
   );
   LEFT_OVER_POLLS['archive_polls'].push({
      pollId,
      filePath: file.file_path,
      fileName: document.file_name,
      chatId,
   });
};

/*
 * Processes the poll response recieved from the Telegram API
 * Currently, it only handles the ZIP poll response
 */
const handlePollResponse = async (poll) => {
   const pollIndex = LEFT_OVER_POLLS['archive_polls'].findIndex(
      (p) => p.pollId === poll.id,
   );
   if (pollIndex === -1) {
      console.error('Poll not found:', poll);
      return;
   }

   // Get the poll and remove it from the list
   const { filePath, chatId, fileName } =
      LEFT_OVER_POLLS['archive_polls'][pollIndex];
   console.log(
      `[POLL] Received response for "${fileName}" | Path: "${filePath}"`,
   );

   LEFT_OVER_POLLS['archive_polls'].splice(pollIndex, 1);

   // Process the poll response
   const sendBack =
      poll.options[poll.options.findIndex((option) => option.voter_count > 0)]
         .text === 'Yes';
   if (sendBack) {
      // Unzip the file into the appropiate directory
      const extension = path.extname(filePath);
      const unzipDir = path.join(UNZIP_DIR, path.basename(filePath, extension));
      if (!fs.existsSync(unzipDir)) fs.mkdirSync(unzipDir);

      console.log(`[UNZIP] Start "${fileName}" in "${unzipDir}"`);
      await extractArchive(filePath, unzipDir);
      console.log(`[UNZIP] Completed "${fileName}"`);

      await recursiveSendFiles(unzipDir, chatId, fileName);
      console.log(`[SEND FILES] Completed "${fileName}"`);

      // Cleanup the unzipped directory
      fs.rmSync(unzipDir, { recursive: true, force: true });
      await sendMessage(
         chatId,
         `Cleanup completed for the file "${fileName}".`,
      );
   } else {
      await sendMessage(
         chatId,
         `Process completed for the file "${fileName}".`,
      );
   }
};

/*
 * Processes the documents recieved from the Telegram API
 * by dispatching them to the appropriate handler
 */
const handleDocument = async (chatId, document) => {
   if (
      document.file_name.endsWith('.zip') ||
      document.file_name.endsWith('.rar')
   )
      await handleArchive(chatId, document);
   else await sendMessage(chatId, "I currently don't support this file type!");
};

/*
 * Processes the photos or videos recieved from the Telegram API
 * Currently, it just downloads the same locally and sends a message back
 */
const handleMultimedia = async (chatId, photo) => {
   for (const mediaSize of photo) {
      const file = await downloadFile(mediaSize.file_id);
      await sendDownloadPathMessage(chatId, file.file_path);
   }
};

/*
 * Process updates from the Telegram API
 * Destructure's the update object and dispatches it to the appropriate handler
 */
const handleUpdate = async (update) => {
   if (update.message) {
      const { chat, text, document, photo, video } = update.message;
      const chatId = chat.id;

      if (photo) await handleMultimedia(chatId, photo);
      else if (video) await handleMultimedia(chatId, video);
      else if (document) await handleDocument(chatId, document);
      else if (text) await handleMessage(chatId, text);
      else {
         await sendMessage(chatId, "I don't understand that message.");
         console.error('Unknown message:', update);
      }
   } else if (update.poll) await handlePollResponse(update.poll);
   else console.error('Unknown update:', update);
};

// Create a IIFE to start the bot
(async () => {
   await setupBot();
   let offset = 0;

   while (true) {
      try {
         const response = await client.get('/getUpdates', {
            params: { offset, timeout: 30 },
         });
         const updates = response.data.result;
         for (const update of updates) {
            offset = update.update_id + 1;
            try {
               await handleUpdate(update);
            } catch (error) {
               console.error('Error handling update:', error.message);
               await sendMessage(
                  update.message.chat.id,
                  `An error occured while processing the update.\n\nMessage: ${error.message}`,
               );
            }
         }
      } catch (error) {
         console.error('Error recieving updates:', error.message);
      }
   }
})();
