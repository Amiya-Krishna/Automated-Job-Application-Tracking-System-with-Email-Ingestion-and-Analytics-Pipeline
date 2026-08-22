function DashboardCards() {

  const cards = [
    {
      title: "Applications",
      value: 25
    },
    {
      title: "Interviews",
      value: 8
    },
    {
      title: "Offers",
      value: 3
    },
    {
      title: "Rejected",
      value: 10
    }
  ];

  return (

    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

      {cards.map((card, index) => (

        <div
          key={index}
          className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow"
        >

          <h2 className="text-gray-500">
            {card.title}
          </h2>

          <p className="text-3xl font-bold text-blue-600 mt-2">
            {card.value}
          </p>

        </div>

      ))}

    </div>

  );
}

export default DashboardCards;