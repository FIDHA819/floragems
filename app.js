const express=require("express")
const app=express();
const env=require("dotenv").config();
const db=require("./config/db")
db()
app.get("/",(req,res)=>{res.send("hello")})
app.listen(process.env.PORT,()=>{console.log("============");
    console.log("started");
    console.log("============");
})
module.exports=app;