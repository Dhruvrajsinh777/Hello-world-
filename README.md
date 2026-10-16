# Rajputana Shringar

A storefront web app for traditional Rajputi clothing and jewellery: poshak, odhna, safa, bandhgala and achkan, plus borla, aad, timaniya, nath, bajuband, payal, hathphool, chooda and bridal sets.

## Features
- Category filters, search and price sorting
- Product detail view with colour selection
- Cart saved in the browser (localStorage), with quantity controls and totals in ₹
- Checkout form for delivery details (name, phone, address, pincode, size notes)
- Mobile-friendly layout

## Run
No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Customise
- **Products:** edit `js/products.js`. Add an `image` URL to any product to show a real photo instead of the placeholder.
- **Orders:** checkout currently logs the order to the console. Connect it to your backend or a payment gateway (such as Razorpay) at the "Hook point" comment in `js/app.js`.
- **Colours and branding:** change the CSS variables at the top of `css/styles.css`.
