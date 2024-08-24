import fetch from 'node-fetch';
import 'dotenv/config';
import express from "express";
import * as paypal from "./paypal-api.js";
const {PORT = 8888} = process.env;

const app = express();
app.set("view engine", "ejs");
app.use(express.static("public"));

//NEW
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

const environment = process.env.ENVIRONMENT || 'sandbox';
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const endpoint_url = environment === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';


app.post('/create_order', (req, res) => {
    get_access_token()
        .then(access_token => {
            let order_data_json = {
                'intent': req.body.intent.toUpperCase(),
                'purchase_units': [{
                    'amount': {
                        'currency_code': 'USD',
                        'value': '100.00'
                    }
                }]
            };
            const data = JSON.stringify(order_data_json)

            fetch(endpoint_url + '/v2/checkout/orders', { //https://developer.paypal.com/docs/api/orders/v2/#orders_create
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${access_token}`
                    },
                    body: data
                })
                .then(res => res.json())
                .then(json => {
                    res.send(json);
                }) //Send minimal data to client
        })
        .catch(err => {
            console.log(err);
            res.status(500).send(err)
        })
});

app.post('/complete_order', (req, res) => {
    get_access_token()
        .then(access_token => {
            fetch(endpoint_url + '/v2/checkout/orders/' + req.body.order_id + '/' + req.body.intent, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${access_token}`
                    }
                })
                .then(res => res.json())
                .then(json => {
                    console.log(json);
                    let intent_object = req.body.intent === "authorize" ? "authorizations" : "captures";
                    //Remove this if you don't want to send email with SendGrid
                  if (json.purchase_units[0].payments[intent_object][0].status === "COMPLETED") {
                      send_email_receipt({"id": json.id, "email": req.body.email});
                    }
                    res.send(json);
                }) //Send minimal data to client
        })
        .catch(err => {
            console.log(err);
            res.status(500).send(err)
        })
});

app.post("/get_client_token", (req, res) => {
    get_access_token()
      .then((access_token) => {
        const payload = req.body.customer_id
          ? JSON.stringify({ customer_id: req.body.customer_id })
          : null;
  
        fetch(endpoint_url + "/v1/identity/generate-token", {
          method: "post",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          body: payload,
        })
          .then((response) => response.json())
          .then((data) => res.send(data.client_token));
      })
      .catch((error) => {
        console.error("Error:", error);
        res.status(500).send("An error occurred while processing the request.");
      });
  });

app.get("/.well-known/apple-developer-merchantid-domain-association", (req, res) => {
  res.sendFile(process.cwd() + '/apple-developer-merchantid-domain-association');
});

//Servers the script.js file
app.get('/applepaystyle.css', (req, res) => {
    res.sendFile(process.cwd() + '/applepaystyle.css');
});



function get_access_token() {
    const auth = `${client_id}:${client_secret}`
    const data = 'grant_type=client_credentials'
    return fetch(endpoint_url + '/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(auth).toString('base64')}`
            },
            body: data
        })
        .then(res => res.json())
        .then(json => {
            return json.access_token;
        })
}

//NEW


// render checkout page with client id & unique client token
app.get("/", async (req, res) => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const merchantId = process.env.PAYPAL_MERCHANT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  try {
    if (!clientId || !merchantId ||  !clientSecret){
      throw new Error("Client Id or App Secret or Merchant Id is missing." + clientId + " <--");
    }
    const clientToken = await paypal.generateClientToken();
    res.render("checkout", { clientId, clientToken, merchantId });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// create order
app.post("/api/orders", async (req, res) => {
  try {
    const order = await paypal.createOrder();
    res.json(order);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Get order
app.post("/api/orders/:orderID", async (req, res) => {
  const { orderID } = req.params;
  try {
    const order = await paypal.getOrder(orderID);
    res.json(order);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// capture payment
app.post("/api/orders/:orderID/capture", async (req, res) => {
  const { orderID } = req.params;
  try {
    const captureData = await paypal.capturePayment(orderID);
    res.json(captureData);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// health check
app.get("/check" ,(req,res) => {
  res.json({
    message: "ok",
    env: process.env.NODE_ENV, 
    baseUrl: process.env.BASE_URL
  })
})

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}/`);
});
