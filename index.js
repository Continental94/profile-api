const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { v7: uuidv7 } = require("uuid");
const db = require("./db");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// AGE GROUP FUNCTION
function getAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

// CREATE PROFILE
app.post("/api/profiles", async (req, res) => {
  const { name } = req.body;

  // VALIDATION
  if (!name) {
    return res.status(400).json({
      status: "error",
      message: "name is required"
    });
  }

  if (typeof name !== "string") {
    return res.status(422).json({
      status: "error",
      message: "name must be a string"
    });
  }

  const cleanName = name.toLowerCase();

  try {
    // CHECK IF EXISTS (better-sqlite3 style)
    const existing = db
      .prepare("SELECT * FROM profiles WHERE name = ?")
      .get(cleanName);

    if (existing) {
      return res.json({
        status: "success",
        message: "Profile already exists",
        data: existing
      });
    }

    // CALL APIs
    const genderRes = await axios.get(
      `https://api.genderize.io/?name=${cleanName}`
    );

    const ageRes = await axios.get(
      `https://api.agify.io/?name=${cleanName}`
    );

    const natRes = await axios.get(
      `https://api.nationalize.io/?name=${cleanName}`
    );

    // VALIDATION
    if (!genderRes.data.gender || genderRes.data.count === 0) {
      return res.status(500).json({
        status: "error",
        message: "Gender data invalid"
      });
    }

    if (!ageRes.data.age) {
      return res.status(500).json({
        status: "error",
        message: "Age data invalid"
      });
    }

    if (!natRes.data.country || natRes.data.country.length === 0) {
      return res.status(500).json({
        status: "error",
        message: "Country data missing"
      });
    }

    // PROCESS DATA
    const gender = genderRes.data.gender;
    const gender_probability = genderRes.data.probability;
    const sample_size = genderRes.data.count;

    const age = ageRes.data.age;
    const age_group = getAgeGroup(age);

    const topCountry = natRes.data.country.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );

    const id = uuidv7();
    const created_at = new Date().toISOString();

    const profile = {
      id,
      name: cleanName,
      gender,
      gender_probability,
      sample_size,
      age,
      age_group,
      country_id: topCountry.country_id,
      country_probability: topCountry.probability,
      created_at
    };

    // SAVE TO DB (better-sqlite3 style)
    db.prepare(`
      INSERT INTO profiles (
        id, name, gender, gender_probability,
        sample_size, age, age_group,
        country_id, country_probability, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      cleanName,
      gender,
      gender_probability,
      sample_size,
      age,
      age_group,
      topCountry.country_id,
      topCountry.probability,
      created_at
    );

    return res.json({
      status: "success",
      data: profile
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "External API error"
    });
  }
});

// SERVER START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});