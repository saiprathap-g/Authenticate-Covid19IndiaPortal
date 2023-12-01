const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const convertStatesDbToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

const convertTotalValuesToResponseObject = (value) => {
  return {
    totalCases: value.cases,
    totalCured: value.cured,
    totalActive: value.active,
    totalDeaths: value.deaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    
        SELECT * FROM user WHERE username = "${username}";
    `;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    
    SELECT * FROM state;
    
    `;
  const dbResponse = await db.all(getStatesQuery);
  response.send(
    dbResponse.map((eachItem) => convertStatesDbToResponseObject(eachItem))
  );
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `SELECT * FROM state WHERE state_id = ${stateId};`;

  const dbResponse = await db.get(getStateQuery);
  response.send(convertStatesDbToResponseObject(dbResponse));
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const addDistrictQuery = `INSERT INTO
      district (district_name,state_id,cases,cured,active,deaths)
    VALUES
      (
        '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
      );`;
  await db.run(addDistrictQuery);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getStateQuery = `SELECT * FROM district WHERE district_id = ${districtId};`;

    const dbResponse = await db.get(getStateQuery);
    response.send(convertDistrictDbToResponseObject(dbResponse));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `

      DELETE FROM district WHERE district_id = ${districtId};

    `;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const { districtId } = request.params;
    const updateDistrictQuery = `
    
        UPDATE
         district
          SET
           district_name = '${districtName}',
           state_id = ${stateId},
           cases = ${cases},
           cured = ${cured},
           active = ${active},
           deaths = ${deaths}
           WHERE district_id = ${districtId};
    
    `;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateReport = `
    
       SELECT SUM(cases) as cases,
       SUM(cured) as cured,
       SUM(active) as active,
       SUM(deaths) as deaths
       FROM district WHERE state_id = ${stateId};
    
    `;

    const stateReportResponse = await db.get(getStateReport);
    response.send(convertTotalValuesToResponseObject(stateReportResponse));
  }
);

module.exports = app;
