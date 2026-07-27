using Microsoft.EntityFrameworkCore.Migrations;

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    public partial class Blocked_SqlTruncate : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("TRUNCATE TABLE Payments;");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
