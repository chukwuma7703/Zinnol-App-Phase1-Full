import csv from "csv-parser";
import { Parser } from "json2csv";
import fs from "fs";

// Parse CSV file and return array of objects
export const parseCsvFile = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (data) => results.push(data))
            .on("end", () => resolve(results))
            .on("error", reject);
    });
};

// Convert array of objects to CSV string
export const convertToCsv = (data, fields) => {
    const parser = new Parser({ fields });
    return parser.parse(data);
};
