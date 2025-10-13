# Manual Installation

For developers and operators who require greater control or need to deploy from source, this guide provides a step-by-step manual installation process. This method is more involved than the recommended [Blocklet Store Deployment](./deployment-and-installation-blocklet-store.md) and assumes you have a running Blocklet Server instance.

Before you begin, please ensure you have met all the requirements outlined in the [Prerequisites](./deployment-and-installation-prerequisites.md) section.

### 1. Clone the Repository

First, clone the official AIGNE Hub repository from GitHub to your local machine and navigate into the project directory.

```bash Clone the repository icon=mdi:github
git clone https://github.com/blocklet/aigne-hub.git
cd aigne-hub
```

### 2. Install Dependencies

Once inside the project directory, use `pnpm` to install all the required dependencies for the project.

```bash Install dependencies icon=pnpm
pnpm install
```

### 3. Build the Project

Next, compile the source code to create a production-ready build of the application. This step transpiles the TypeScript code and bundles the frontend assets.

```bash Build the project icon=mdi:tools
pnpm build
```

### 4. Bundle and Deploy

Finally, package the application into a Blocklet bundle and deploy it to your Blocklet Server. This command performs both actions sequentially.

```bash Bundle and Deploy icon=mdi:rocket-launch
pnpm bundle && blocklet deploy .blocklet/bundle
```

After the deployment command completes successfully, AIGNE Hub will be installed and running on your Blocklet Server. You can now proceed to the [Configuration](./configuration.md) section to set up your AI providers and other settings.