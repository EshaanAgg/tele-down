const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');
const unzipper = require('unzipper');
const FormData = require('form-data');

// CONSTANTS
const UNZIP_DIR = './unzipped/';
const BASE_SERVER_URL = 'http://localhost:8081';
const LEFT_OVER_POLLS = {
   zip_polls: [],
};

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
 * Send a document to a chat
 * @param {number} chatId - The chat ID to send the document to
 * @param {string} filePath - The path to the file to send
 * @returns {Promise<number>} The message ID of the sent document
 */
const sendFile = async (chatId, filePath) => {
   // Check the file type
   const fileType = path.extname(filePath).slice(1);

   // Send images using Multipart/form-data
   if (['jpg', 'jpeg', 'png', 'gif'].includes(fileType)) {
      let imageData = fs.readFileSync(filePath);
      let formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('photo', imageData, {
         filename: path.basename(filePath),
      });

      const response = await client.post('/sendPhoto', formData, {
         headers: formData.getHeaders(),
      });
      return response.data.result.message_id;
   }
   // Send videos using Multipart/form-data
   else if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(fileType)) {
      let videoData = fs.readFileSync(filePath);
      let formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('video', videoData, {
         filename: path.basename(filePath),
      });

      const response = await client.post('/sendVideo', formData, {
         headers: formData.getHeaders(),
      });
      return response.data.result.message_id;
   } else {
      const messageID = await sendMessage(
         chatId,
         `I don't support sending files of type "${fileType}" [File: "${path.basename(filePath)}"].`,
      );
      return messageID;
   }
};
/*
 * Download a file from Telegram, given the file ID
 * @param {string} fileId - The file ID to download
 * @returns {Promise<File>} - A promise that resolves with the file of the downloaded file
 * @throws {Error} If the file could not be downloaded
 */
const downloadFile = async (fileId) => {
   const response = await client.get(`/getFile?file_id=${fileId}`);
   return response.data.result;
};

/*
 * Unzip a file to a directory
 * @param {string} zipFilePath - The path to the zip file
 * @param {string} outputDir - The directory to unzip the file to
 * @returns {Promise<void>} - A promise that resolves when the file is unzipped successfully
 */
const unzipFile = async (zipFilePath, outputDir) => {
   return fs
      .createReadStream(zipFilePath)
      .pipe(unzipper.Extract({ path: outputDir }))
      .promise();
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
 * Processes the ZIP documents recieved from the Telegram API
 */
const handleZipDocument = async (chatId, document) => {
   await sendMessage(chatId, `Received "${document.file_name}". Processing...`);

   const file = await downloadFile(document.file_id);
   await sendMessage(
      chatId,
      `Downloaded "${document.file_name}" successfully on the server! You can find the file at "${file.file_path}" on the server.`,
   );

   const pollId = await sendPoll(
      chatId,
      'Would you like me to send the unzipped the files back to you?',
      ['Yes', 'No'],
   );
   LEFT_OVER_POLLS['zip_polls'].push({
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
   const pollIndex = LEFT_OVER_POLLS['zip_polls'].findIndex(
      (p) => p.pollId === poll.id,
   );
   if (pollIndex === -1) {
      console.error('Poll not found:', poll);
      return;
   }

   // Get the poll and remove it from the list
   const { filePath, chatId, fileName } =
      LEFT_OVER_POLLS['zip_polls'][pollIndex];
   LEFT_OVER_POLLS['zip_polls'].splice(pollIndex, 1);

   // Process the poll response
   const sendBack =
      poll.options[poll.options.findIndex((option) => option.voter_count > 0)]
         .text === 'Yes';
   if (sendBack) {
      const unzipDir = path.join(UNZIP_DIR, path.basename(filePath, '.zip'));
      if (!fs.existsSync(unzipDir)) fs.mkdirSync(unzipDir);
      await unzipFile(filePath, unzipDir);

      const files = fs.readdirSync(unzipDir);
      for (const file of files) {
         const fileToSend = path.join(unzipDir, file);
         await sendFile(chatId, fileToSend);
      }
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
   if (document.mime_type === 'application/zip')
      await handleZipDocument(chatId, document);
   else await sendMessage(chatId, "I currently don't support this file type!");
};

/*
 * Process updates from the Telegram API
 * Destructure's the update object and dispatches it to the appropriate handler
 */
const handleUpdate = async (update) => {
   if (update.message) {
      const { chat, text, document } = update.message;
      const chatId = chat.id;

      if (document) await handleDocument(chatId, document);
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
            await handleUpdate(update);
         }
      } catch (error) {
         console.error('Error processing updates:', error.message);
      }
   }
})();
