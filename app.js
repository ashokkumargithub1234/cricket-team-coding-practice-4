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

app.get("/", async (request, response) => {
  response.send("Data Loaded");
});

app.get("/initialize-database", async (request, response) => {
  const initializedDatabase = await fetchAndInsert();
  response.send(initializedDatabase);
});

/* -----------------------CRUD OPERATIONS------------------------------*/
app.get("/get-product/:id", async (request, response) => {
  const { id } = request.params;
  const productData = await database.get(`
        SELECT
            *
        FROM 
            transactions 
        WHERE 
            id = ${id};
    `);
  response.send(productData);
});

const deleteProductData = async (deleteId) => {
  // console.log(typeof productId);
  if (deleteId === "") {
    return "Product Not Found";
  }
  const productData = await database.run(`
    DELETE FROM
      transactions
    WHERE
      id = ${deleteId};`);

  return {
    msg: `ID ${deleteId} Product Deleted Successfully`,
  };
};

app.delete("/products/:deleteId/", async (request, response) => {
  const { deleteId } = request.params;
  const deleteProduct = await deleteProductData(deleteId);

  response.send(deleteProduct);
});

const modifyProductData = async (
  id,
  title,
  price,
  description,
  category,
  image,
  sold,
  dateOfSale
) => {
  const queryData = `SELECT id FROM transactions WHERE id = ${id}`;
  const findData = await database.get(queryData);
  // console.log(findData);
  if (findData === undefined) {
    const newProductData = await database.run(`
   INSERT INTO transactions(id,title,price,description,category,image,sold,dateOfSale) 
    VALUES (
       ${id},
       '${title.replace(/'/g, "''")}',
       ${price},
       '${description.replace(/'/g, "''")}',
       '${category.replace(/'/g, "''")}',
       '${image.replace(/'/g, "''")}',
       ${sold},
       '${dateOfSale.replace(/'/g, "''")}'
   )
    ;`);
    return { msg: `id = ${id} New Product Added` };
  } else if (findData !== undefined) {
    const newProductData = await database.run(`
   UPDATE 
        transactions 
   SET 
   title = '${title.replace(/'/g, "''")}',
   price = '${price}',
   description = '${description.replace(/'/g, "''")}',
   category = '${category.replace(/'/g, "''")}',
   image = '${image.replace(/'/g, "''")}',
   sold = ${sold},
   dateOfSale = '${dateOfSale.replace(/'/g, "''")}'
   
     WHERE 
    id = ${id}
    ;`);
    return { msg: `ProductID = ${id} ProductUpdatedSuccessfully` };
  }
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
  const addPostData = await modifyProductData(
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

app.put("/update-product/:id", async (request, response) => {
  const { id } = request.params;
  const {
    title,
    price,
    description,
    category,
    image,
    sold,
    dateOfSale,
  } = request.body;
  const updatedProduct = await modifyProductData(
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

/*---------------------------------------------------------------------*/

const getAllTransactions = async (limit, offset, searchText, selectedMonth) => {
  // console.log(selectedMonth);
  let getTodoQuery;
  let totalSearchedItems;
  if (selectedMonth === "" && searchText === "") {
    getTodoQuery = `
     SELECT
      *
    FROM
      transactions
    
        LIMIT ${limit} OFFSET ${offset}
      `;
    totalSearchedItems = `
      SELECT
      count(id) as total
    FROM
      transactions
   
      `;
  } else if (selectedMonth === "" && searchText !== "") {
    getTodoQuery = `
     SELECT
      *
    FROM
      transactions
    WHERE
      (title LIKE '%${searchText}%' OR description LIKE '%${searchText}%' OR price LIKE '%${searchText}%')
        LIMIT ${limit} OFFSET ${offset}
      `;
    totalSearchedItems = `
      SELECT
      count(id) as total
    FROM
      transactions
    WHERE
      (title LIKE '%${searchText}%' OR description LIKE '%${searchText}%' OR price LIKE '%${searchText}%')
      `;
  } else {
    const monthValue = format(new Date(selectedMonth), "MM");

    getTodoQuery = `
     SELECT
      *
    FROM
      transactions
    WHERE
      (title LIKE '%${searchText}%' OR description LIKE '%${searchText}%' OR price LIKE '%${searchText}%')
      AND dateOfSale LIKE '%-${monthValue}-%'      
        LIMIT ${limit} OFFSET ${offset}
      `;
    totalSearchedItems = `
      SELECT
      count(id) as total
    FROM
      transactions
    WHERE
      (title LIKE '%${searchText}%' OR description LIKE '%${searchText}%' OR price LIKE '%${searchText}%')
      AND dateOfSale LIKE '%-${monthValue}-%' 
      `;
  }

  const todoQuery = await database.all(getTodoQuery);
  const totalItems = await database.get(totalSearchedItems);
  return { transactionsData: todoQuery, totalItems };
};

const getStatistics = async (selectedMonth) => {
  let statistics = [];
  let totalSaleAmt;
  let totalSoldItems;
  let totalUnsoldItems;

  if (selectedMonth === "") {
    totalSaleAmt = `
    SELECT 
    SUM(price) AS total_sale_amt
    FROM transactions 
    WHERE sold = 1;`;

    totalSoldItems = `
    SELECT COUNT()AS Total_sold_items
        FROM 
    transactions 
        WHERE 
    sold = 1;`;

    totalUnsoldItems = `
    SELECT 
    COUNT()AS Total_unSold_items
        FROM 
    transactions
    WHERE sold = 0;`;
  } else {
    const monthValue = format(new Date(selectedMonth), "MM");

    totalSaleAmt = `
    SELECT 
    SUM(price) AS total_sale_amt
    FROM transactions 
    WHERE dateOfSale LIKE '%-${monthValue}-%' and sold = 1;`;

    totalSoldItems = `
    SELECT COUNT()AS Total_sold_items
        FROM 
    transactions 
        WHERE 
    dateOfSale LIKE '%-${monthValue}-%' 
        and 
    sold = 1;`;

    totalUnsoldItems = `
    SELECT 
    COUNT()AS Total_unSold_items
        FROM 
    transactions
    WHERE dateOfSale LIKE '%-${monthValue}-%' and sold = 0;`;
  }
  const saleResponseResult = await database.all(totalSaleAmt);
  statistics.push(saleResponseResult);

  const soldResponseResult = await database.all(totalSoldItems);
  statistics.push(soldResponseResult);
  const unSoldResponseResult = await database.all(totalUnsoldItems);
  statistics.push(unSoldResponseResult);
  return statistics.flat();
};

const getBarChartData = async (selectedMonth) => {
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
    let total;
    if (selectedMonth === "") {
      total = await database.get(`SELECT 
            COUNT() AS count
        FROM 
        transactions 
            WHERE 
        price BETWEEN ${range.min} AND ${range.max};`);

      barChartData.push({
        priceRange: `${range.min}-${range.max}`,
        totalItems: total.count,
      });
    } else {
      const monthValue = format(new Date(selectedMonth), "MM");

      total = await database.get(`SELECT 
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
  }

  return barChartData;
};

const getPieChartData = async (selectedMonth) => {
  let pieChartData;
  if (selectedMonth === "") {
    pieChartData = await database.all(`
    SELECT 
    category,count(id) as items 
    FROM transactions 
    GROUP BY category;
  `);
  } else {
    const monthValue = format(new Date(selectedMonth), "MM");

    pieChartData = await database.all(`
    SELECT 
    category,count(id) as items 
    FROM transactions 
    WHERE dateOfSale LIKE '%-${monthValue}-%' 
    GROUP BY category;
  `);
  }

  return pieChartData;
};

app.get("/transactions", async (request, response) => {
  const {
    searchText = "",
    selectedMonth = "",
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
  const { selectedMonth = "" } = request.query;
  const statistics = await getStatistics(selectedMonth);
  response.send(statistics);
});

app.get("/bar-chart", async (request, response) => {
  const { selectedMonth = "" } = request.query;
  const barChartData = await getBarChartData(selectedMonth);
  response.send(barChartData);
});

app.get("/pie-chart", async (request, response) => {
  const { selectedMonth = "" } = request.query;
  const pieChartData = await getPieChartData(selectedMonth);
  response.send(pieChartData);
});

app.get("/combined-data", async (request, response) => {
  const {
    searchText = "",
    selectedMonth = "",
    limit = 10,
    offset = 0,
    deleteId = "",
  } = request.query;
  const combinedData = {
    initializedDatabase: await fetchAndInsert(),
    transactions: await getAllTransactions(
      limit,
      offset,
      searchText,
      selectedMonth
    ),
    statistics: await getStatistics(selectedMonth),
    barChartData: await getBarChartData(selectedMonth),
    pieChartData: await getPieChartData(selectedMonth),
  };
  response.send(combinedData);
});

module.exports = app;
