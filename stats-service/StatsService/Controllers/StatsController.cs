using System.Data;
using Dapper;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace StatsService.Controllers;

[ApiController]
public class StatsController : ControllerBase
{
    private readonly IConfiguration _cfg;

    public StatsController(IConfiguration cfg) => _cfg = cfg;

    private IDbConnection Db()
    {
        var cs = _cfg.GetConnectionString("Db");
        return new MySqlConnection(cs);
    }

    [HttpGet("/health")]
    public IActionResult Health() => Ok(new { ok = true });

    [HttpGet("/stats")]
    public async Task<IActionResult> Stats([FromQuery] int userId)
    {
        if (userId <= 0) return BadRequest(new { ok = false, error = "userId is required" });

        using var db = Db();

        var total = await db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM conversions WHERE user_id=@userId",
            new { userId }
        );

        var byPair = (await db.QueryAsync<PairRow>(
            @"SELECT
                COALESCE(input_format,'unknown') AS input,
                COALESCE(output_format,'unknown') AS output,
                COUNT(*) AS count
              FROM conversions
              WHERE user_id=@userId
              GROUP BY COALESCE(input_format,'unknown'), COALESCE(output_format,'unknown')
              ORDER BY count DESC",
            new { userId }
        )).ToList();

        var byInput = (await db.QueryAsync<KeyCountRow>(
            @"SELECT COALESCE(input_format,'unknown') AS `key`, COUNT(*) AS `count`
              FROM conversions
              WHERE user_id=@userId
              GROUP BY COALESCE(input_format,'unknown')
              ORDER BY `count` DESC",
            new { userId }
        )).ToList();

        var byOutput = (await db.QueryAsync<KeyCountRow>(
            @"SELECT COALESCE(output_format,'unknown') AS `key`, COUNT(*) AS `count`
              FROM conversions
              WHERE user_id=@userId
              GROUP BY COALESCE(output_format,'unknown')
              ORDER BY `count` DESC",
            new { userId }
        )).ToList();

        return Ok(new
        {
            ok = true,
            userId,
            total,
            byInput,
            byOutput,
            byPair
        });
    }

    private sealed class KeyCountRow
    {
        public string key { get; set; } = "";
        public int count { get; set; }
    }

    private sealed class PairRow
    {
        public string input { get; set; } = "";
        public string output { get; set; } = "";
        public int count { get; set; }
    }
}
