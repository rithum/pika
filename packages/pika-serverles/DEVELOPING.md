# Developing

To test locally, cd into the pika-serverless dir and run

```bash
npm link
```

Then go into the directory where you want to test the plugin and do

```bash
npm link pika-serverless
```

When ready to remove link do

```bash
npm unlink pika-serverless
npm install pika-serverless@latest  # Install the published version
```
