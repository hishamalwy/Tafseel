using Microsoft.EntityFrameworkCore.Migrations;

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    public partial class Blocked_DropTable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ObsoleteScratch");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
