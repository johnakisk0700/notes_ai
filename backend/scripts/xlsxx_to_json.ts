#!/usr/bin/env node
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

/**
 * Converts an XLSX file to a JSON object.
 *
 * @param {string} filePath - The path to the XLSX file.
 * @returns {Object} - A JSON object where each key is a sheet name and its value is an array of row objects.
 */
function xlsxToJson(filePath) {
  // Read the workbook from the specified file path.
  const workbook = XLSX.readFile(filePath);

  // This object will hold the JSON representation for each sheet.
  const result = {};

  // Iterate over every sheet in the workbook.
  workbook.SheetNames.forEach((sheetName) => {
    // Get the current sheet.
    const worksheet = workbook.Sheets[sheetName];

    // Convert the sheet to JSON. The `defval` option ensures that empty cells are set to null.
    const sheetData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    // Store the JSON data using the sheet name as the key.
    result[sheetName] = sheetData;
  });

  return result;
}

function main() {
  // Get the XLSX file path from command-line arguments.
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node script.js <path_to_excel_file>");
    process.exit(1);
  }

  const xlsxFilePath = args[0];

  try {
    // Convert the XLSX file to a JSON object.
    const jsonData = xlsxToJson(xlsxFilePath);

    // Create the JSON file path in the same directory as the XLSX file.
    const dirName = path.dirname(xlsxFilePath);
    const baseName = path.basename(xlsxFilePath, path.extname(xlsxFilePath));
    const jsonFilePath = path.join(dirName, `${baseName}.json`);

    // Write the JSON object to a file with pretty-printing.
    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
    console.log(`JSON file created at: ${jsonFilePath}`);
  } catch (error) {
    console.error("Error processing file:", error);
    process.exit(1);
  }
}

// Run the script.
main();
