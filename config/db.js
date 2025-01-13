const mongoose=require("mongoose")
const env=require("dotenv").config();


const connectDB=async()=>{
    try{
        await mongoose.connect(process.env.MONGODB_URI,{
            family: 4,})
        console.log("DB connected");
        
    }catch(error){
        console.log("DB Connection error",error.message)
    }
}
module.exports=connectDB