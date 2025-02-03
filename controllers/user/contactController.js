const nodemailer = require('nodemailer');

// Render the Contact Us page
const getContactPage = async (req, res) => {
    try {
        const user = req.session.user; // Retrieve user data from session
        res.render('user/contact', { user });
    } catch (error) {
        console.error('Error rendering contact page:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Handle form submissions
const handleContactForm = async (req, res) => {
    const { name, email, subject, message } = req.body;

    // Basic validation
    if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        // Configure Nodemailer for sending emails
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.NODEMAILER_EMAIL, 
                pass: process.env.NODEMAILER_PASSWORD, 
            },
        });

        // Email options
        const mailOptions = {
            from: `"${name}" <${email}>`, // Display user's name and email as the sender
            to: 'fidhapichu461@gmail.com', // Replace with your support email
            subject: `Contact Form Submission: ${subject}`,
            text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        };

        // Send the email
        await transporter.sendMail(mailOptions);

        // Send success response
        res.status(200).json({ message: 'Your message has been sent successfully.' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'An error occurred while sending your message. Please try again later.' });
    }
};

module.exports = {
    getContactPage,
    handleContactForm,
};
