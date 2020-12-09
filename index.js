const AWS = require("aws-sdk");
const emlformat = require("./modules/lib/eml-format");
const nodemailer = require("nodemailer");

const ses = new AWS.SES();

const transporter = nodemailer.createTransport({
  SES: ses,
});

const response = {
  statusCode: 200,
  body: "received",
};

module.exports.handler = async (event, context, callback) => {
  console.log(event);
  const messageId = event.Records[0].ses.mail.messageId;
  console.log("messageId: ", messageId);

  const email = await fetchEmail(messageId);

  await parseEmail(email.Body.toString("ascii"), messageId);
  callback(null);
};

const checkImage = async (image) => {
  let rek = new AWS.Rekognition();
  try {
    return rek
      .detectLabels({
        Image: { Bytes: image },
        MaxLabels: 50,
        MinConfidence: 90,
      })
      .promise();
  } catch (err) {
    console.log(err);
  }
};

const checkImageCustom = async (image) => {
  let rek = new AWS.Rekognition();
  try {
    return rek
      .detectCustomLabels({
        Image: { Bytes: image },
        MinConfidence: 50,
        ProjectVersionArn: process.env.PROJECT,
      })
      .promise();
  } catch (err) {
    console.log(err);
  }
};

const fetchEmail = async (messageId) => {
  const s3 = new AWS.S3();
  return s3
    .getObject({
      Bucket: process.env.BUCKET,
      Key: messageId,
    })
    .promise();
};

const saveImage = async (image, messageId) => {
  const s3 = new AWS.S3();
  return s3
    .putObject({
      Body: image,
      Bucket: process.env.BUCKET,
      Key: `image_output/${messageId}.jpg`,
    })
    .promise();
};

const parseEmail = async (eml, messageId) => {
  return new Promise(function (resolve, reject) {
    emlformat.read(eml, async function (error, data) {
      if (error) {
        console.log(error);
      }

      if (data.attachments) {
        try {
          let results = await checkImage(data.attachments[0].data);
          await saveImage(data.attachments[0].data, messageId);
          //if (labelCheck(results.Labels)) {
          if (labelCheck(results.Labels)) {
            return sendEmail(data);
          } else {
            console.log("no people found");
            resolve();
          }
        } catch (err) {
          console.log(err);
          reject();
        }
      } else {
        console.log("no email attachments found");
        resolve();
      }
    });
  });
};

const sendEmail = async (data) => {
  var mailOptions = {
    from: process.env.FROM,
    subject: data.subject,
    html: data.html,
    to: process.env.TO.split(","),
    attachments: [
      {
        filename: "movement.jpg",
        content: data.attachments[0].data,
      },
    ],
    // bcc: Any BCC address you want here in an array,
  };

  transporter.sendMail(mailOptions, function (err, info) {
    if (err) {
      console.log("Error sending email", err);
      return Promise.resolve();
    } else {
      console.log("Email sent successfully");
      return Promise.resolve();
    }
  });
};

const labelCheck = (labels) => {
  console.log("called", labels.length);
  let found = false;
  labels.forEach((label) => {
    switch (label.Name) {
      case "person":
        if (
          label.Geometry.BoundingBox.Left >= 0.54 &&
          label.Geometry.BoundingBox.Top >= 0.27
        ) {
          found = true;
        }

        break;
      case "package":
        found = true;
        break;
      default:
    }
  });
  return found;
};
