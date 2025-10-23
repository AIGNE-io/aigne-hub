# Deployment and Installation

This section provides comprehensive instructions for deploying AIGNE Hub. It covers the recommended one-click method via the Blocklet Store and the manual installation process from source code for developers and custom environments.

Before proceeding, it is essential to review the system prerequisites to ensure your environment is correctly configured. Proper setup is critical for a successful deployment, whether you are aiming for a quick start or a customized installation.

```d2
direction: down

Start: {
  label: "Start Deployment"
  shape: oval
}

Prerequisites: {
  label: "Review System\nPrerequisites"
  shape: rectangle
}

Decision: {
  label: "Choose Deployment\nMethod"
  shape: diamond
}

One-Click-Install: {
  label: "Blocklet Store:\nOne-Click Install"
  shape: rectangle
}

Clone-Repo: {
  label: "Manual: Clone\nSource Code"
  shape: rectangle
}

Install-Deps: {
  label: "Manual: Install\nDependencies"
  shape: rectangle
}

Run-App: {
  label: "Manual: Run\nApplication"
  shape: rectangle
}

End: {
  label: "AIGNE Hub Deployed"
  shape: oval
}

Start -> Prerequisites
Prerequisites -> Decision
Decision -> One-Click-Install: "Recommended"
Decision -> Clone-Repo: "For Developers"

One-Click-Install -> End

Clone-Repo -> Install-Deps
Install-Deps -> Run-App
Run-App -> End

```

## Deployment Methods

There are two primary methods for deploying AIGNE Hub. Select the method that best aligns with your technical requirements and operational environment.

<x-cards data-columns="2">
  <x-card data-title="Blocklet Store Deployment (Recommended)" data-icon="lucide:store">
    The fastest and most straightforward method. It allows for a one-click installation and handles all dependencies and initial setup automatically within a Blocklet Server environment. This approach is ideal for most users.
  </x-card>
  <x-card data-title="Manual Installation from Source" data-icon="lucide:file-code-2">
    Intended for developers who need to customize the installation, contribute to the project, or deploy AIGNE Hub in a non-Blocklet Server environment. It involves cloning the source code and managing dependencies manually.
  </x-card>
</x-cards>

## Detailed Guides

For detailed, step-by-step instructions, proceed to the relevant sub-section. Ensure you meet all prerequisites before starting the installation process.

<x-cards data-columns="1">
  <x-card data-title="Prerequisites" data-icon="lucide:clipboard-list" data-href="/deployment-and-installation/prerequisites" data-horizontal="true">
    Review the required software and environment settings, such as Node.js and Blocklet Server, before beginning the installation.
  </x-card>
  <x-card data-title="Blocklet Store Deployment" data-icon="lucide:rocket" data-href="/deployment-and-installation/blocklet-store" data-horizontal="true">
    Follow the one-click installation guide for the simplest deployment experience.
  </x-card>
  <x-card data-title="Manual Installation" data-icon="lucide:terminal" data-href="/deployment-and-installation/manual-installation" data-horizontal="true">
    Access the step-by-step instructions for installing from the source code repository.
  </x-card>
</x-cards>

## Summary

This section outlines the available pathways for deploying AIGNE Hub. For most operational scenarios, the [Blocklet Store Deployment](./deployment-and-installation-blocklet-store.md) is recommended for its simplicity and reliability. For development or specialized environments, the [Manual Installation](./deployment-and-installation-manual-installation.md) guide provides the necessary detailed instructions. After successful deployment, the next step is to configure the system, as detailed in the [Configuration](./configuration.md) section.