using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tafseel.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// The Teacher Offering price a student saw when they sent a Direct Request (DEC-13, UX-09).
    ///
    /// Two nullable columns and a both-or-neither check; deliberately no data update. Requests created
    /// before this migration keep null: nobody knows what price was on the screen at the time, and guessing
    /// it from today's offering or from the accepted order would be inventing history, so those requests
    /// simply show no comparison.
    /// </summary>
    public partial class ListedPriceAtRequest : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ListedCurrencyAtRequest",
                table: "LearningRequests",
                type: "varchar(3)",
                unicode: false,
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ListedPriceAtRequest",
                table: "LearningRequests",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_LearningRequests_ListedPrice",
                table: "LearningRequests",
                sql: "([ListedPriceAtRequest] IS NULL AND [ListedCurrencyAtRequest] IS NULL) OR ([ListedPriceAtRequest] IS NOT NULL AND [ListedPriceAtRequest] > 0 AND [ListedCurrencyAtRequest] IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_LearningRequests_ListedPrice",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "ListedCurrencyAtRequest",
                table: "LearningRequests");

            migrationBuilder.DropColumn(
                name: "ListedPriceAtRequest",
                table: "LearningRequests");
        }
    }
}
