function JobTable() {

  const jobs = [
    {
      company: "Google",
      role: "Frontend Developer",
      status: "Applied"
    },
    {
      company: "Amazon",
      role: "SDE Intern",
      status: "Interview"
    }
  ];

  return (

    <div className="bg-white rounded-xl shadow p-5 mt-8 overflow-x-auto">

      <table className="w-full">

        <thead>

          <tr className="border-b">

            <th className="text-left py-3">Company</th>
            <th className="text-left py-3">Role</th>
            <th className="text-left py-3">Status</th>
            <th className="text-left py-3">Actions</th>

          </tr>

        </thead>

        <tbody>

          {jobs.map((job, index) => (

            <tr key={index} className="border-b">

              <td className="py-4">{job.company}</td>

              <td>{job.role}</td>

              <td>
                <span className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-sm">
                  {job.status}
                </span>
              </td>

              <td>
                <button className="text-green-600 mr-3">
                  Edit
                </button>

                <button className="text-red-600">
                  Delete
                </button>
              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );
}

export default JobTable;