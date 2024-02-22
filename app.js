const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const format = require("date-fns/format");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const databasePath = path.join(__dirname, "productsTransaction.db");

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
    createTable();
  } catch (error) {
    console.log(`DB Error:${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const createTable = async () => {
  const createQuery = `
    CREATE TABLE IF NOT EXISTS transactions(
        id TEXT ,
        title TEXT,
        price TEXT,
        description TEXT,
        category TEXT,
        image TEXT,
        sold BOOLEAN,
        dateOfSale DATETIME
    );`;

  await database.run(createQuery);
};

const fetchAndInsert = async () => {
  const response = await axios.get(
    "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
  );
  const data = response.data;

  for (let item of data) {
    const queryData = `SELECT id FROM transactions WHERE id = ${item.id}`;
    const existingData = await database.get(queryData);
    if (existingData === undefined) {
      const query = `
   INSERT INTO transactions (id, title, price, description, category, image, sold, dateOfSale) 
   VALUES (
       ${item.id},
       '${item.title.replace(/'/g, "''")}',
       ${item.price},
       '${item.description.replace(/'/g, "''")}',
       '${item.category.replace(/'/g, "''")}',
       '${item.image.replace(/'/g, "''")}',
       ${item.sold},
       '${item.dateOfSale.replace(/'/g, "''")}'
   );
`; /*The .replace(/'/g, "''") in the SQL query helps prevent SQL injection attacks by escaping single quotes.*/

      await database.run(query);
    }
  }
  console.log("Transactions added");
  return "Transactions added";
};

app.get("/initialize-database", async (request, response) => {
  const initializedDatabase = await fetchAndInsert();
  response.send(initializedDatabase);
});

/* -----------------------CRUD OPERATIONS------------------------------*/

const postNewProductData = async (
  id,
  title,
  price,
  description,
  category,
  image,
  sold,
  dateOfSale
) => {
  const newProductData = await database.run(`
   INSERT INTO transactions(id,title,price,description,category,image,sold,dateOfSale) 
    VALUES (${id}, '${title}', '${price}', 
    '${description}','${category}','${image}',${sold},'${dateOfSale}')
    ;`);
  return { msg: `id = ${id} NewProductAdded` };
};

app.post("/add-product-data/", async (request, response) => {
  const {
    id,
    title,
    price,
    description,
    category,
    image,
    sold,
    dateOfSale,
  } = request.body;
  const addPostData = await postNewProductData(
    id,
    title,
    price,
    description,
    category,
    image,
    sold,
    dateOfSale
  );
  response.send(addPostData);
});

const updateProduct = async (
  productId,
  id,
  title,
  price,
  description,
  category,
  image,
  sold,
  dateOfSale
) => {
  const newProductData = await database.run(`
   UPDATE 
        transactions 
   SET 
   id = ${id},
   price = '${price}',
   description = '${description}',
   title = '${title}',
   category = '${category}',
   image = '${image}',
   sold = ${sold},
   dateOfSale = '${dateOfSale}'
   
     WHERE 
    id = ${productId}
    ;`);
  return { msg: `ProductID = ${productId} ProductUpdatedSuccessfully` };
};

app.put("/update-product/:productId", async (request, response) => {
  const { productId } = request.params;
  const {
    id,
    title,
    price,
    description,
    category,
    image,
    sold,
    dateOfSale,
  } = request.body;
  const updatedProduct = await updateProduct(
    productId,
    id,
    title,
    price,
    description,
    category,
    image,
    sold,
    dateOfSale
  );
  response.send(updatedProduct);
});

const deleteProductData = async (deleteProductId) => {
  const productId = await database.run(`
    DELETE FROM
      transactions
    WHERE
      id = '${deleteProductId}';`);
  if (productId.changes === 0) {
    return {
      msg: "Product Not Found",
    };
  } else {
    return {
      msg: `ID ${deleteProductId} Product Deleted Successfully`,
    };
  }
};

app.delete("/products/:productId/", async (request, response) => {
  const { deleteProductId } = request.params;
  const deleteProduct = await deleteProductData(deleteProductId);

  response.send(deleteProduct);
});

/*---------------------------------------------------------------------*/

const getAllTransactions = async (limit, offset, searchText, selectedMonth) => {
  // console.log(selectedMonth);

  const monthValue = format(new Date(selectedMonth), "MM");

  const getTodoQuery = `
     SELECT
      *
    FROM
      transactions
    WHERE
      (title LIKE '%${searchText}%' OR description LIKE '%${searchText}%' OR price LIKE '%${searchText}%')
      AND dateOfSale LIKE '%-${monthValue}-%'      
        LIMIT ${limit} OFFSET ${offset}
      `;
  const totalSearchedItems = `
      SELECT
      count(id) as total
    FROM
      transactions
    WHERE
      (title LIKE '%${searchText}%' OR description LIKE '%${searchText}%' OR price LIKE '%${searchText}%')
      AND dateOfSale LIKE '%-${monthValue}-%' 
      `;

  const todoQuery = await database.all(getTodoQuery);
  const totalItems = await database.get(totalSearchedItems);
  return { transactionsData: todoQuery, totalItems };
};

const getStatistics = async (selectedMonth) => {
  let statistics = [];
  const monthValue = format(new Date(selectedMonth), "MM");

  const total_sale_amt = `
    SELECT 
    SUM(price) AS total_sale_amt
    FROM transactions 
    WHERE dateOfSale LIKE '%-${monthValue}-%' and sold = 1;`;
  const saleResponseResult = await database.all(total_sale_amt);
  statistics.push(saleResponseResult);

  const total_sold_items = `
    SELECT COUNT()AS Total_sold_items
        FROM 
    transactions 
        WHERE 
    dateOfSale LIKE '%-${monthValue}-%' 
        and 
    sold = 1;`;
  const soldResponseResult = await database.all(total_sold_items);
  statistics.push(soldResponseResult);

  const total_unsold_items = `
    SELECT 
    COUNT()AS Total_unSold_items
        FROM 
    transactions
    WHERE dateOfSale LIKE '%-${monthValue}-%' and sold = 0;`;
  const unSoldResponseResult = await database.all(total_unsold_items);
  statistics.push(unSoldResponseResult);
  return statistics.flat();
};

const getBarChartData = async (selectedMonth) => {
  const monthValue = format(new Date(selectedMonth), "MM");
  const barChartData = [];

  const priceRange = [
    { min: 0, max: 100 },
    { min: 101, max: 200 },
    { min: 201, max: 300 },
    { min: 301, max: 400 },
    { min: 401, max: 500 },
    { min: 501, max: 600 },
    { min: 601, max: 700 },
    { min: 701, max: 800 },
    { min: 801, max: 900 },
    { min: 901, max: 10000 },
  ];

  for (let range of priceRange) {
    const total = await database.get(`SELECT 
            COUNT() AS count
        FROM 
        transactions 
            WHERE 
        dateOfSale LIKE '%-${monthValue}-%' and price BETWEEN ${range.min} AND ${range.max};`);

    barChartData.push({
      priceRange: `${range.min}-${range.max}`,
      totalItems: total.count,
    });
  }

  return barChartData;
};

const getPieChartData = async (selectedMonth) => {
  const monthValue = format(new Date(selectedMonth), "MM");
  const pieChartData = await database.all(`
    SELECT 
    category,count(id) as items 
    FROM transactions 
    WHERE dateOfSale LIKE '%-${monthValue}-%' 
    GROUP BY category;
  `);
  return pieChartData;
};

app.get("/transactions", async (request, response) => {
  const {
    searchText = "",
    selectedMonth = "01",
    limit = 10,
    offset = 0,
  } = request.query;
  const transactions = await getAllTransactions(
    limit,
    offset,
    searchText,
    selectedMonth
  );
  response.send(transactions);
});

app.get("/statistics", async (request, response) => {
  const { selectedMonth } = request.query;
  const statistics = await getStatistics(selectedMonth);
  response.send(statistics);
});

app.get("/bar-chart", async (request, response) => {
  const { selectedMonth } = request.query;
  const barChartData = await getBarChartData(selectedMonth);
  response.send(barChartData);
});

app.get("/pie-chart", async (request, response) => {
  const { selectedMonth } = request.query;
  const pieChartData = await getPieChartData(selectedMonth);
  response.send(pieChartData);
});

app.get("/combined-data", async (request, response) => {
  const {
    searchText = "",
    selectedMonth = "01",
    limit = 10,
    offset = 0,
    deleteProductId = "",
  } = request.query;
  const combinedData = {
    transactions: await getAllTransactions(
      limit,
      offset,
      searchText,
      selectedMonth
    ),
    statistics: await getStatistics(selectedMonth),
    barChartData: await getBarChartData(selectedMonth),
    pieChartData: await getPieChartData(selectedMonth),
    deleteProductData: await deleteProductData(deleteProductId),
  };
  response.send(combinedData);
});

module.exports = app;
