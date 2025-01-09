const mongoose=require("mongoose")
const {Schema} =mongoose;

const userSchema= new Schema({
    name:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true,
        unique:true,
    },
    phone:{
        type:String,
        required:false,
        unique:false,
        sparse:true,
        default:null
    },
    googleId:{
        type:String,
        unique:true,
        sparse:true
    },
    password:{
        type:String,
        required:false
    },
    isBlocked:{
        type:Boolean,
        default:false
    },
    isAdmin:{
        type:Boolean,
        default:false
    },
   
    cart: [
        {
          productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
          },
          quantity: {
            type: Number,
            required: true,
            min: 1,
          },
        },
      ],
    wallet:{
        type:Number,
        default:0,
    },
    wishlist:[{
        type:Schema.Types.ObjectId,
        ref:"wishlist"
    }],
    orderHistory:[{
        type:Schema.Types.ObjectId,
        ref:"Order"
    }],
    createdOn:{
        type:Date,
        default:Date.now
    },
    referalCode:{
        type:Boolean
    },
    redeemedUsers:[{
        type:Schema.Types.ObjectId,
        ref:"User"
    }],
    searchhistory:[{
         category:{
            type:Schema.Types.ObjectId,
            ref:"category"
         },
         brand:{
            type:String
         },
         searchOn:{
            type:Date,
            default:Date.now
         }
    }]
})
const User=mongoose.model("User",userSchema);
module.exports=User