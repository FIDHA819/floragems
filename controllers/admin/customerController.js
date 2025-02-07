const User = require("../../models/userschema");

const customerInfo = async (req, res) => {
    try {
        let search = "";
        if (req.query.search) {
            search = req.query.search.trim();
        }

        let page = parseInt(req.query.page) || 1;
        const limit = 3;

        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ],
        })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();


        const count = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ],
        }).countDocuments();


        res.render("admin/customers", {
            users: userData,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            searchQuery: search,
        });
    } catch (error) {
        console.error("Error fetching customer info:", error);
        res.status(500).send("Internal Server Error");
    }
};

const customerBlocked = async (req, res) => {
    try {
        const id = req.query.id;
        await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
        res.redirect("/admin/users");
    } catch (error) {
        console.error("Error blocking customer:", error);
        res.status(500).send("Internal Server Error");
    }
};

const customerunBlocked = async (req, res) => {
    try {
        const id = req.query.id;
        await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
        res.redirect("/admin/users");
    } catch (error) {
        console.error("Error unblocking customer:", error);
        res.status(500).send("Internal Server Error");
    }
};

module.exports = {
    customerInfo,
    customerBlocked,
    customerunBlocked,
};
