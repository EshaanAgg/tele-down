const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');
const unzipper = require('unzipper');

// CONSTANTS
const DOWNLOAD_DIR = './downloads/';
const UNZIP_DIR = './unzipped/';
const BASE_SERVER_URL = 'http://localhost:8081/';
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
const setupBot = () => {
   dotenv.config();

   const BOT_TOKEN = process.env.BOT_TOKEN;
   if (!BOT_TOKEN) {
      console.error('BOT_TOKEN is required in the environment variables.');
      process.exit(1);
   }
   client = axios.create({ baseURL: `${BASE_SERVER_URL}/bot${BOT_TOKEN}` });

   if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);
   if (!fs.existsSync(UNZIP_DIR)) fs.mkdirSync(UNZIP_DIR);
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
   const response = await client.post('/sendDocument', {
      chat_id: chatId,
      document: fs.createReadStream(filePath),
   });
   return response.data.result.message_id;
};

/*
 * Download a file from Telegram, given the file ID
 * @param {string} fileId - The file ID to download
 * @param {string} filePath - The path to save the downloaded file
 * @returns {Promise<void>} - A promise that resolves when the file is downloaded successfully
 */
const downloadFile = async (fileId, filePath) => {
   const response = await client.get(`/getFile?file_id=${fileId}`);
   const filePathTelegram = response.data.result.file_path;

   const writer = fs.createWriteStream(filePath);
   const downloadUrl = `${BASE_SERVER_URL}/file/bot${BOT_TOKEN}/${filePathTelegram}`;
   const downloadResponse = await axios.get(downloadUrl, {
      responseType: 'stream',
   });
   downloadResponse.data.pipe(writer);

   return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
   });
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

   const filePath = path.join(DOWNLOAD_DIR, document.file_name);
   await downloadFile(document.file_id, filePath);
   await sendMessage(
      chatId,
      `Downloaded "${document.file_name}" successfully on the server! You can find the file at "${filePath}" on the server.`,
   );

   const pollId = await sendPoll(
      chatId,
      'Would you like me to send the unzipped the files back to you?',
      ['Yes', 'No'],
   );
   LEFT_OVER_POLLS['zip_polls'].push({ pollId, filePath, chatId });
};

/*
 * Processes the poll response recieved from the Telegram API
 * Currently, it only handles the ZIP poll response
 */
const handlePollResponse = async (pollId, chatId, poll_answer) => {
   const pollIndex = LEFT_OVER_POLLS['zip_polls'].findIndex(
      (poll) => poll.pollId === pollId && poll.chatId === chatId,
   );
   if (pollIndex === -1) {
      await sendMessage(chatId, 'This poll could not be found in the system.');
      return;
   }

   // Get the poll and remove it from the list
   const { filePath } = LEFT_OVER_POLLS['zip_polls'][pollIndex];
   LEFT_OVER_POLLS['zip_polls'].splice(pollIndex, 1);

   // Process the poll response
   const sendBack = poll_answer.option_ids[0] === 0;
   if (sendBack) {
      const unzipDir = path.join(UNZIP_DIR, path.basename(filePath, '.zip'));
      if (!fs.existsSync(unzipDir)) fs.mkdirSync(unzipDir);
      await unzipFile(filePath, unzipDir);
      const files = fs.readdirSync(unzipDir);
      for (const file of files) {
         const fileToSend = path.join(unzipDir, file);
         await sendFile(chatId, fileToSend);
      }
      fs.rmSync(filePath);
      fs.rmSync(unzipDir, { recursive: true, force: true });
      await sendMessage(chatId, 'Cleanup completed.');
   } else {
      await sendMessage(chatId, 'No files were sent back to you.');
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
   const { chat, text, document, poll_answer } = update.message;
   const chatId = chat.id;

   if (document) await handleDocument(chatId, document);
   else if (text) await handleMessage(chatId, text);
   else if (poll_answer)
      await handlePollResponse(poll_answer.poll_id, chatId, poll_answer);
};

// Create a IIFE to start the bot
(async () => {
   setupBot();
   let offset = 0;

   while (true) {
      try {
         const response = await client.get('/getUpdates', {
            params: { offset },
         });
         const updates = response.data.result;
         for (const update of updates) {
            offset = update.update_id + 1;
            if (update.message) {
               await handleUpdate(update);
            }
         }
      } catch (error) {
         console.error('Error processing updates:', error.message);
      }
   }
})();
