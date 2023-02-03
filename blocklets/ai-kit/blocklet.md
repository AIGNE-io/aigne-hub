# AI Kit

AI Kit is a blocklet that brings AI capabilities to other blocklets. With AI Kit, developers can easily incorporate AI into their projects and create powerful applications.

## Features

- Easy to use interface for integrating AI into applications
- Supports popular AI providers such as OpenAI

## Install and Run

- Click the Launch button
- You need to purchase a Blocklet Server first (if you don't already have one)
- Follow the installation wizard to install blocklet on your Blocklet Server
- Start the installed blocklet in the Blocklet Server console
- Set `OPENAI_API_KEY` in **Blocklets -> AI Kit -> Components -> AI Kit -> Settings -> Environment** and restart blocklet
  ![setting-api-key](docs/setting-api-key.jpg)
- Access the public address of the blocklet, you can open playground from admin account menus
  ![playground](docs/playground.jpg)

## Integrate into your blocklet

- Add AI Kit as a component into your blocklet
- Set `OPENAI_API_KEY` in `AI Kit` component settings and restart your blocklet
- Call AI Kit's api

[AI Kit api references](docs/api.md)

## Support

If you have any questions or need help getting started, please feel free to reach out to us at <liyechao@arcblock.io>. We are happy to help!
