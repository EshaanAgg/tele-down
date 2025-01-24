# TeleDown

This project helps you to setup a local Telegram server and create a bot that can be used to download files from Telegram at a blazing speed (and not be prone to the speed limitations of the Telegram API)! This project helps you to create your own bot and server which you can run on your local machine or on a server whenever you want to download files from Telegram.

## Installation

1. Create your own environment variables file.

```bash
cp .sample.env .env
```

2. You would need to get a API ID and API HASH from Telegram. You can get it by following the steps mentioned [here](https://core.telegram.org/api/obtaining_api_id). This a one time thing, and should take 2 minutes at max. Set the same as `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` in the `.env` file.

3. Now you would need to create a bot on Telegram that would be used to download files. You can create a bot by sending the `/newbot` command to the [@BotFather](https://t.me/botfather) chat, and following the onscreen instructions to obtain the bot token. Your token will look something like this:

```
4839574812:AAFD39kkdpWt3ywyRZergyOLMaJhac60qc
```

Set the token of the bot as `TELEGRAM_BOT_TOKEN` in the `.env` file. Should take 2 minutes at max again.

4. Run the server! This script will take 5-10 minutes to run for the first time as it would download the required dependencies and build it using `gcc` and `make` for your platform. In subsequent runs, it would start instantly.

```bash
chmod +x ./run.sh
./run.sh
```

5. Install [Node JS](https://nodejs.org/en/download/) if you haven't already. You can check if you have it installed by running `node -v` and `npm -v`. If you get a version number, you are good to go! 

6. Run the bot!

```bash
cd bot
npm install
npm run start
```

7. You are all set! You can now use the bot to download files from Telegram at a blazing speed!

## Quick Run

You can use the `make run` command directly in the terminal after installation to run both the server and the bot. Please be careful that using this command would clear all the local data and the downloaded files from your system. If you do not wish to do the same, then you can run the bot and the server in seperate terminals as described in the installation process.  

## Current Functionality

Current the bot has the following functionality:
- Message `/start` - Start the bot and send a health check message.
- Sending a `.zip` or `.rar` file: 
  - The bot will download the file on the computer running the server and send a message with the file path.
  - You can also choose if you want the bot to send back the unzipped files (this is very useful if you want to get unzipped video or images from a `.zip` file, and then view them using Telegram's inbuilt player!).
    - If you choose `Yes` for the above option, the bot will send give you the information of one directory at a time, and you can choose which directory want to recursively explore more and whose multimedia files you want to be sent back! 
- Sending any `video` or `image` file:
  - The bot will download the file on the computer running the server and send a message with the file path.
  - For images, all the different sizes of the image will be downloaded.