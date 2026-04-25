import{serve}from"h3-v2";import{default as server}from"./dist/server/server.js";console.log("server.fetch type:", typeof server.fetch);serve(server.fetch,{port:3003});console.log("Started");
