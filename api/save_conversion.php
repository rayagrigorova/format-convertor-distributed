<?php
/**
 * save-conversion.php
 * 
 * This script saves a user's conversion (input/output data and settings) to the database.
 * It is only accessible to logged-in users and expects a JSON payload with relevant fields.
 * On success, it stores the conversion and returns a JSON success response.
 */

require __DIR__.'/db.php'; // Include database connection and start session

// Check if the user is logged in; deny access if not
if (!isset($_SESSION['uid'])) {
    http_response_code(401); // Unauthorized
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

// Read and decode the incoming JSON data
$data = json_decode(file_get_contents('php://input'), true);

// Prepare and execute SQL statement to insert the conversion into the `conversions` table
$pdo->prepare("
  INSERT INTO conversions
    (user_id, input_format, output_format, settings, input_text, output_text)
  VALUES (?,?,?,?,?,?)
")->execute([
  $_SESSION['uid'],                          // The ID of the logged-in user
  $data['input_format']  ?? null,            // Format of the input data (e.g. JSON, YAML)
  $data['output_format'] ?? null,            // Format of the output data (e.g. XML, CSV)
  $data['settings']      ?? '',              // Optional transformation settings as text
  $data['input']         ?? '',              // Original input text
  $data['output']        ?? ''               // Resulting output text
]);

// Return a success response
echo json_encode(['ok' => true]);
