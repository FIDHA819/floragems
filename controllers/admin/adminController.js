const User = require("../../models/userschema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Category = require("../../models/categorySchema");
const Product =require("../../models/productSchema");

const pageerror=async(req,res)=>{
    res.render("admin/page-404")
}

// Load Admin Login Page
const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard");
    }
    res.render("admin/admin-login", { message: null });
};


const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        
        const admin = await User.findOne({ email: email, isAdmin: true });

        if (!admin) {
            console.log("Admin not found");
            return res.render("admin/admin-login", { message: "Invalid credentials" });
        }

        // Check if the password matches
        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            console.log("Incorrect password");
            return res.render("admin/admin-login", { message: "Invalid credentials" });
        }

        // Set admin session and redirect to dashboard
        req.session.admin = true;
        console.log("Admin logged in successfully");
        return res.redirect("/admin/dashboard");
    } catch (error) {
        console.error("Admin login error:", error);
        return res.redirect("/pageerror");
    }
};


const loadDashboard = async (req, res) => {
    if (req.session.admin) {
        try {
            const products = await Product.aggregate([
                {
                  $lookup: {
                    from: "orders", 
                    localField: "_id",
                    foreignField: "products.productId", 
                    as: "orders"
                  }
                },
                {
                  $addFields: {
                    orderCount: { $size: "$orders" } 
                  }
                },
                {
                  $sort: { orderCount: -1 } 
                },
                {
                  $limit: 4 
                }
              ]);
          

              const customers = await User.aggregate([
                {
                  $lookup: {
                    from: "orders", 
                    localField: "_id",
                    foreignField: "userId", 
                    as: "orders"
                  }
                },
                {
                  $addFields: {
                    orderCount: { $size: "$orders" } 
                  }
                },
                {
                  $project: {
                    name: 1, 
                    email: 1, 
                    orderCount: 1 
                  }
                },
                {
                  $sort: { orderCount: -1 } 
                },
                {
                  $limit: 10 
                }
              ]);
              const topCategories = await Product.aggregate([
                {
                  $group: {
                    _id: "$category",
                    productCount: { $sum: 1 } 
                  }
                },
                {
                  $lookup: {
                    from: "categories", 
                    localField: "_id",
                    foreignField: "_id",
                    as: "categoryInfo"
                  }
                },
                {
                  $unwind: "$categoryInfo" 
                },
                {
                  $project: {
                    categoryName: "$categoryInfo.name",
                    productCount: 1 
                  }
                },
                {
                  $sort: { productCount: -1 } 
                },
                {
                  $limit: 10 
                }
              ]);
              
              const topBrands = await Product.aggregate([
                {
                  $group: {
                    _id: "$brand", 
                    productCount: { $sum: 1 } 
                  }
                },
                {
                  $project: {
                    brandName: "$_id", 
                    productCount: 1 
                  }
                },
                {
                  $sort: { productCount: -1 }
                },
                {
                  $limit: 10 
                }
              ]);
              
       
              
              
          
            return res.render("admin/admin-dashboard",{ products,customers,topCategories,topBrands});
        } catch (error) {
            console.error("Error loading admin dashboard:", error);
            return res.redirect("/pageerror");
        }
    } else {
        return res.redirect("/admin/login");
    }
};
const logout=async(req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                console.log("Error destroying session");
                return res.redirect("/pageerror")

            }
            res.redirect("/admin/login")
        })
    } catch (error) {
        console.log("Unexpected eror during logout",error);
        res.redirect("/pageerror")
        
    }
}


module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout,

};
