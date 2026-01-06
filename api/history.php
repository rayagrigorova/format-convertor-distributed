<?php
/**
 * history.php
 * 
 * This endpoint returns the history of conversions for the currently logged-in user.
 * It expects that the user is already authenticated via session (checked below).
 * The data is pulled from the 'conversions' table and returned as JSON.
 */

require __DIR__.'/db.php'; // Include the database connection

// Log the current script name, session ID, and user ID (if set) to the PHP error log (useful for debugging)
error_log(__FILE__.' '.session_id().' uid='.($_SESSION['uid']??'¬'));

// If no user is logged in, return 401 Unauthorized and a JSON error
if (!isset($_SESSION['uid'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

// Prepare a SQL query to fetch all saved conversions for this user, most recent first
$stmt = $pdo->prepare("
  SELECT id,input_format,output_format,input_text,output_text,settings,created_at
  FROM conversions
  WHERE user_id = ?
  ORDER BY id DESC
");

// Execute the query with the logged-in user's ID as a parameter
$stmt->execute([$_SESSION['uid']]);

// Fetch all results as an associative array and return them as JSON
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
