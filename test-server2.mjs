import{serve,toNodeListener}from"h3-v2";import{default as server}from"./dist/server/server.js";const handler=server.fetch;const server2=serve(handler,{port:3003});console.log("Started server2");
