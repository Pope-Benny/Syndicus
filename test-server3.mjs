import{serve}from"h3-v2";import{default as server}from"./dist/server/server.js";serve((req)=>server.fetch(req),{port:3003});console.log("Started on 3003");
