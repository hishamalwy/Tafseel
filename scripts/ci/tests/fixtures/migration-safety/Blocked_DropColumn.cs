using Microsoft.EntityFrameworkCore.Migrations;

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    public partial class Blocked_DropColumn : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LegacyNote",
                table: "Payments");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LegacyNote",
                table: "Payments",
                type: "nvarchar(100)",
                nullable: true);
        }
    }
}
