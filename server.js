const express = require('express');
const proxy = require('express-http-proxy');
const app = express();
const bodyParser = require('body-parser');
const targetUrl = 'https://openrouter.ai';
const openaiKey = process.env.OPENAI_KEY;
const proxyKey = process.env.PROXY_KEY; // Your secret proxy key
const port = 7860;
const baseUrl = getExternalUrl(process.env.SPACE_ID);

app.use(bodyParser.json({ limit: '50mb' }));

// Middleware to log request details
app.use((req, res, next) => {
  console.log(`Incoming Request - Method: ${req.method}, URL: ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});


// Middleware to authenticate requests with the proxy key and check the model
function authenticateProxyKeyAndModel(req, res, next) {
  const providedKey = req.headers['auro']; // Assuming the key is sent in the 'x-proxy-key' header
  const requestedModel = req.body.model;

  // List of allowed models
  const allowedModels = ['gryphe/mythomist-7b', 'gryphe/mythomax-l2-13b'];

  if (providedKey && providedKey === proxyKey && allowedModels.includes(requestedModel)) {
    // If the provided key matches the expected key and the requested model is allowed, allow the request to proceed
    next();
  } else {
    // If the key is missing or incorrect, or the model is not allowed, reject the request with an error response
    res.status(401).json({ error: 'Unauthorized or invalid model' });
  }
}



app.use('/api', authenticateProxyKeyAndModel, (req, res, next) => {
  if (req.body && req.body.messages) {
    req.body.messages = req.body.messages.map(message => {
      if (message.role !== 'system' && message.content) {
        // Remove newlines and extra spaces from the start and end of the content
        // for non-system messages only
        message.content = message.content.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
      }
      return message;
    });
    
    // Log the processed messages to verify the changes
    console.log('Processed messages:', JSON.stringify(req.body.messages, null, 2));
  }
  next();
}, proxy(targetUrl, {
  proxyReqPathResolver: (req) => '/api/v1/chat/completions',
  proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
    proxyReqOpts.headers['Authorization'] = 'Bearer ' + openaiKey;
    
    if (srcReq.body) {
      // Use the modified body
      const modifiedBody = JSON.stringify(srcReq.body);
      proxyReqOpts.headers['Content-Length'] = Buffer.byteLength(modifiedBody);
      proxyReqOpts.body = modifiedBody;
      
      // Log the body being sent to the API
      console.log('Body being sent to API:', modifiedBody);
    }
    
    return proxyReqOpts;
  },
}));




app.get("/", (req, res) => {
  // res.send(This is your OpenAI Reverse Proxy URL: ${baseUrl});
});

function getExternalUrl(spaceId) {
  try {
    const [username, spacename] = spaceId.split("/");
    return `https://${username}-${spacename.replace(/_/g, "-")}.hf.space/api/v1`;
  } catch (e) {
    return "";
  }
}
app.listen(port, () => {
  console.log(`Reverse proxy server running on ${baseUrl}`);
});