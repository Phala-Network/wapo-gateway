# Wapo Gateway

Wapo Gateway is an API gateway for the Wapo Runtime that operates in a serverless-like manner.


## Q&A

### What is Wapo?

Wapo is a JavaScript runtime based on quickjs, designed to run inside SGX enclaves. More information about Wapo can be found [here](https://github.com/Phala-Network/phat-quickjs/tree/master/WapoJS).


### What is Wapo Gateway?

Wapo Gateway is an HTTP server that functions as a wapo host script. It maps incoming HTTP requests to guest scripts and executes them using the Wapo Runtime.

To learn more about the concept of gateway, you can visit [this link](https://github.com/Phala-Network/phat-frame-gateway/) which provides similar APIs. Additionally, we offer a [Hono](https://hono.dev/) adapter to simplify the process. You can explore our [minimal starter kit](https://github.com/Leechael/minimal-wapo-ts-starter) for further details.


### Can we use Wapo Gateway to run our Next.js app?

Not yet.


### Can we accessing database via socket, like Redis or Postgres?

No. The networking layer of Wapo only supports HTTP and HTTPs.
