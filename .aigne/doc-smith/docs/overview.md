# Blocklet Store Deployment

Deploying AIGNE Hub via the Blocklet Store is the recommended method for most operational scenarios. This approach leverages a one-click installation process, which significantly simplifies the initial setup and ensures that the system is configured correctly on a running Blocklet Server instance.

This method is ideal for teams who want to get AIGNE Hub running quickly without the complexities of manual source code compilation and dependency management.

## Step-by-Step Installation Guide

Follow these steps to deploy and configure AIGNE Hub from the Blocklet Store.

### Step 1: Locate AIGNE Hub in the Blocklet Store

Navigate to the official [Blocklet Store](https://store.blocklet.dev) and use the search functionality to find "AIGNE Hub". The store provides detailed information about the blocklet, including its features, version history, and system requirements.

### Step 2: Launch the Installation

Once on the AIGNE Hub page, click the "Launch" button. This will initiate the installation process on your connected Blocklet Server.

![AIGNE Hub in Blocklet Store](../../../blocklets/core/screenshots/c29f08420df8ea9a199fcb5ffe06febe.png)

### Step 3: Follow the Installation Wizard

The system will guide you through an installation wizard. Follow the on-screen prompts to complete the setup. The wizard handles the deployment of all necessary components and dependencies automatically.

### Step 4: Initial Configuration

After the installation is complete, the final step is to configure the AI providers you intend to use.

1.  Access the AIGNE Hub administrative panel.
2.  Navigate to the **Config** section and select **AI Providers**.
3.  Add the necessary API keys and credentials for each AI service you wish to connect. All credentials are AES-encrypted at rest to ensure security.

![Configure AI Providers](../../../blocklets/core/screenshots/d037b6b6b092765ccbfa58706c241622.png)

Once your providers are configured, your AIGNE Hub instance is fully operational and ready to serve API requests for your internal teams or, if configured, external customers.